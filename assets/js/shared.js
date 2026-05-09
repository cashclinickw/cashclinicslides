/* ================================================================
   Cash Clinic - Shared JavaScript
   ================================================================ */

(function() {
  'use strict';

  // ========== Form persistence ==========
  const FormStore = {
    getKey(formId) { return `cc_form_${formId}`; },
    save(formId, data) {
      try {
        localStorage.setItem(this.getKey(formId), JSON.stringify({
          data, savedAt: new Date().toISOString()
        }));
        return true;
      } catch (e) {
        console.error('Save failed:', e);
        return false;
      }
    },
    load(formId) {
      try {
        const raw = localStorage.getItem(this.getKey(formId));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        console.error('Load failed:', e);
        return null;
      }
    },
    delete(formId) { localStorage.removeItem(this.getKey(formId)); },
    listAll() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('cc_form_')) {
          const id = k.replace('cc_form_', '');
          try { out[id] = JSON.parse(localStorage.getItem(k)); }
          catch (e) {}
        }
      }
      return out;
    }
  };
  window.FormStore = FormStore;

  // ========== Form serialization ==========
  function serializeForm(formEl) {
    const data = {};
    formEl.querySelectorAll('[data-field]').forEach(el => {
      const name = el.dataset.field;
      if (el.type === 'checkbox') {
        data[name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) data[name] = el.value;
      } else {
        data[name] = el.value;
      }
    });
    return data;
  }

  function applyData(formEl, data) {
    if (!data) return;
    formEl.querySelectorAll('[data-field]').forEach(el => {
      const name = el.dataset.field;
      if (!(name in data)) return;
      const val = data[name];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else if (el.type === 'radio') {
        el.checked = (el.value === val);
      } else {
        el.value = val == null ? '' : val;
      }
    });
  }

  function fieldCount(formEl) {
    const fields = new Set();
    formEl.querySelectorAll('[data-field]').forEach(el => fields.add(el.dataset.field));
    return fields.size;
  }

  function filledCount(formEl) {
    const filled = new Set();
    formEl.querySelectorAll('[data-field]').forEach(el => {
      let isFilled = false;
      if (el.type === 'checkbox') isFilled = el.checked;
      else if (el.type === 'radio') isFilled = el.checked;
      else isFilled = el.value && el.value.toString().trim().length > 0;
      if (isFilled) filled.add(el.dataset.field);
    });
    return filled.size;
  }

  // ========== Init for report pages ==========
  function initReportPage() {
    const docEl = document.querySelector('[data-form-id]');
    if (!docEl) return;
    const formId = docEl.dataset.formId;

    // Load saved data
    const saved = FormStore.load(formId);
    if (saved && saved.data) {
      applyData(docEl, saved.data);
    }

    // Save status indicator
    const statusEl = document.getElementById('save-status');
    function updateStatus(state, msg) {
      if (!statusEl) return;
      statusEl.className = 'save-status ' + state;
      statusEl.innerHTML = '<span class="save-dot"></span><span>' + msg + '</span>';
    }
    updateStatus('saved', 'محفوظ');

    // Auto-save (debounced)
    let saveTimer = null;
    function scheduleSave() {
      updateStatus('saving', 'جاري الحفظ...');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const data = serializeForm(docEl);
        if (FormStore.save(formId, data)) {
          const total = fieldCount(docEl);
          const filled = filledCount(docEl);
          updateStatus('saved', `محفوظ (${filled}/${total})`);
        } else {
          updateStatus('saving', 'فشل الحفظ');
        }
      }, 500);
    }
    docEl.addEventListener('input', scheduleSave);
    docEl.addEventListener('change', scheduleSave);

    // Print button
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        // Save first
        const data = serializeForm(docEl);
        FormStore.save(formId, data);
        setTimeout(() => window.print(), 100);
      });
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('هل تريد فعلاً مسح جميع البيانات في هذا التقرير؟ لا يمكن التراجع.')) return;
        FormStore.delete(formId);
        location.reload();
      });
    }

    // Export JSON
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = serializeForm(docEl);
        const blob = new Blob([JSON.stringify({
          formId, exportedAt: new Date().toISOString(), data
        }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `${formId}_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Import JSON
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const json = JSON.parse(ev.target.result);
            if (json.data) {
              applyData(docEl, json.data);
              scheduleSave();
              alert('تم الاستيراد بنجاح');
            } else { alert('الملف غير صالح'); }
          } catch (err) {
            alert('فشل قراءة الملف: ' + err.message);
          }
        };
        reader.readAsText(file);
        importFile.value = '';
      });
    }

    // Auto-fill today's date in date fields
    document.querySelectorAll('[data-fill-today]').forEach(el => {
      if (!el.value) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        el.value = `${dd} / ${mm} / ${yyyy}`;
      }
    });
  }

  // ========== Init for dashboard ==========
  function initDashboard() {
    const dash = document.querySelector('[data-dashboard]');
    if (!dash) return;

    const allForms = FormStore.listAll();
    let totalFilledForms = 0;
    let lastEditDate = null;

    document.querySelectorAll('[data-form-card]').forEach(card => {
      const formId = card.dataset.formCard;
      const status = card.querySelector('.status-pill');
      const data = allForms[formId];
      if (data && data.data) {
        const fields = Object.values(data.data).filter(v => {
          if (v === true) return true;
          if (typeof v === 'string') return v.trim().length > 0;
          return false;
        });
        if (fields.length > 0) {
          totalFilledForms++;
          if (!lastEditDate || data.savedAt > lastEditDate) lastEditDate = data.savedAt;
          if (status) {
            status.classList.remove('partial', 'complete');
            // Heuristic: > 25 filled fields = mostly complete
            if (fields.length > 25) {
              status.classList.add('complete');
              status.textContent = 'مكتمل';
            } else {
              status.classList.add('partial');
              status.textContent = `جزئي (${fields.length})`;
            }
          }
        }
      }
    });

    // Update stats
    const statForms = document.getElementById('stat-forms-active');
    if (statForms) statForms.textContent = totalFilledForms;
    const statLastEdit = document.getElementById('stat-last-edit');
    if (statLastEdit) {
      if (lastEditDate) {
        const d = new Date(lastEditDate);
        const now = new Date();
        const diffH = (now - d) / 36e5;
        let s;
        if (diffH < 1) s = 'منذ دقائق';
        else if (diffH < 24) s = `منذ ${Math.floor(diffH)} ساعة`;
        else s = `منذ ${Math.floor(diffH/24)} يوم`;
        statLastEdit.textContent = s;
      } else {
        statLastEdit.textContent = '—';
      }
    }
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initReportPage();
    initDashboard();
  });
})();
