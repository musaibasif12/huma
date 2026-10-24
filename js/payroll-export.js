(function () {
  'use strict';
  const U = window.HCMUtils;
  function saveFile(bytes, type, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Prevent spreadsheet formulas from running when names or departments are opened.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function payrollCSV(rows, period, companyName) {
    const values = [['Company', 'Period', 'Employee', 'Email', 'Department', 'Base salary (PKR)', 'Deductions (PKR)', 'Net salary (PKR)', 'Payment status', 'Recorded paid amount (PKR)', 'Status updated', 'Calculation']];
    for (const { employee, slip, payment } of rows) values.push([companyName, period, employee.name, employee.email, employee.department,
      slip.salary.toFixed(2), slip.eligible ? slip.deduction.toFixed(2) : '', slip.eligible ? slip.netSalary.toFixed(2) : '',
      !slip.eligible ? 'Unavailable' : payment?.status === 'paid' ? 'Paid' : 'Not paid', payment?.status === 'paid' ? payment.amount.toFixed(2) : '',
      payment?.updatedAt || '', !slip.eligible ? 'Unavailable' : slip.provisional ? 'Estimate' : 'Calculated']);
    return '\uFEFF' + values.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function downloadPayroll(year, month) {
    const rows = window.HCMPayroll.listPayroll(year, month);
    const period = `${year}-${String(month).padStart(2, '0')}`;
    saveFile(payrollCSV(rows, period, window.HCMStorage.getCompany().name), 'text/csv;charset=utf-8', `huma-payroll-${period}.csv`);
  }
  function imagePDF(jpeg, width, height) {
    // One A4 page containing a high-resolution locally rendered statement.
    const encoder = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));
    const parts = [];
    const offsets = [0];
    let length = 0;
    function append(value) { const bytes = typeof value === 'string' ? encoder(value) : value; parts.push(bytes); length += bytes.length; }
    function object(id, value) { offsets[id] = length; append(`${id} 0 obj\n${value}\nendobj\n`); }
    append('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = length;
    append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    append(jpeg); append('\nendstream\nendobj\n');
    const commands = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    object(5, `<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
    const xref = length;
    append('xref\n0 6\n0000000000 65535 f \n');
    for (let id = 1; id <= 5; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const output = new Uint8Array(length);
    let position = 0;
    for (const part of parts) { output.set(part, position); position += part.length; }
    return output;
  }
  async function downloadPayslip(employeeId, year, month) {
    const slip = window.HCMPayroll.calculatePayslip(employeeId, year, month);
    if (!slip.eligible) throw new Error('No payslip is available for this period.');
    const companyId = window.HCMStorage.getActiveCompanyId();
    const company = window.HCMStorage.getCompany();
    const employee = window.HCMStorage.findById('users', employeeId);
    const payment = window.HCMPayroll.payment(employeeId, year, month);
    const canvas = document.createElement('canvas');
    canvas.width = 1190; canvas.height = 1684;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PDF rendering is unavailable in this browser. Use Print payslip to save a PDF.');
    ctx.scale(2, 2); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 595, 842);
    let y = 48;
    function text(value, size = 11, weight = '400', color = '#192522', x = 40) {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`; ctx.fillStyle = color;
      ctx.fillText(String(value), x, y); y += size + 10;
    }
    function wrapped(value, size = 11, weight = '400', color = '#192522') {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      let line = '';
      for (const word of String(value).split(/\s+/)) {
        if (line && ctx.measureText(`${line} ${word}`).width > 510) { text(line, size, weight, color); line = ''; }
        if (line) line += ' ';
        for (const char of Array.from(word)) {
          if (ctx.measureText(line + char).width > 510) { text(line, size, weight, color); line = ''; }
          line += char;
        }
      }
      if (line) text(line, size, weight, color);
    }
    function rule() { ctx.strokeStyle = '#E5EAE6'; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(555, y); ctx.stroke(); y += 24; }
    function pair(label, value, emphasis = false) {
      ctx.font = `${emphasis ? '600' : '400'} ${emphasis ? 14 : 11}px Inter, Arial, sans-serif`;
      ctx.fillStyle = emphasis ? '#275D4E' : '#192522';
      ctx.fillText(label, 40, y); ctx.textAlign = 'right'; ctx.fillText(String(value), 555, y); ctx.textAlign = 'left'; y += emphasis ? 34 : 25;
    }
    const logo = new Image();
    try {
      await new Promise((resolve, reject) => { logo.onload = resolve; logo.onerror = reject; logo.src = '../assets/huma-logo.svg'; });
      ctx.drawImage(logo, 40, 24, 28, 28);
    } catch { /* The statement remains downloadable if its optional logo cannot load. */ }
    text('huma', 25, '600', '#275D4E', 78); y = 86;
    wrapped(company.name, 13, '600');
    const period = `${year}-${String(month).padStart(2, '0')}`;
    text(`Salary statement | ${U.formatDate(`${period}-01`, { day: undefined, month: 'long' })}`, 18, '600');
    text(slip.provisional ? 'Estimate - attendance recorded to date' : 'Calculated from recorded attendance', 10, '400', '#64736B');
    rule();
    wrapped(employee.name, 15, '600'); wrapped(employee.department, 11); wrapped(employee.email, 10, '400', '#64736B');
    text(`Generated: ${U.formatDate(new Date())}`, 10); rule();
    pair('Working days in month', slip.workingDays); pair('Days attended', slip.presentDays);
    pair('Late arrivals (included)', slip.lateDays); pair('Half days (included)', slip.halfDays);
    pair('Absent days', slip.absentDays); pair('Approved paid leave days', slip.approvedLeaveDays); rule();
    const money = (amount) => `PKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    pair('Monthly base salary', money(slip.salary)); pair('Daily rate', money(slip.dailyRate)); pair('Deductions', money(slip.deduction));
    pair('Net salary', money(slip.netSalary), true);
    pair('Payment status', payment?.status === 'paid' ? 'Paid' : 'Not paid');
    if (payment?.status === 'paid') { pair('Recorded paid amount', money(payment.amount)); pair('Marked paid on', U.formatDate(new Date(payment.updatedAt))); }
    rule();
    wrapped('Deduction = daily rate x (absent days + 0.5 x half days). Late arrivals add no extra deduction. Approved paid leave is not absence.', 9, '400', '#64736B');
    if (slip.provisional) wrapped('Estimate: future dates and today\u2019s missing check-in are excluded. The full monthly base is shown; this is not pay earned to date.', 9, '400', '#64736B');
    // Recheck authorization after the asynchronous image load, before downloading personnel data.
    window.HCMPayroll.calculatePayslip(employeeId, year, month);
    if (window.HCMStorage.getActiveCompanyId() !== companyId) throw new Error('The active company changed. Reopen the payslip.');
    const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]), (char) => char.charCodeAt(0));
    saveFile(imagePDF(jpeg, canvas.width, canvas.height), 'application/pdf', `huma-payslip-${period}-${employee.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}.pdf`);
  }
  window.HCMPayrollExport = Object.freeze({ payrollCSV, imagePDF, downloadPayroll, downloadPayslip });
}());
