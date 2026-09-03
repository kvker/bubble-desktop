// 按键统计窗口渲染：轮询主进程报告并渲染打星星得分置顶行 + 最近 7 天逐日按键表格
const wrap = document.getElementById('table-wrap');
const scoreWrap = document.getElementById('score-wrap');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// 打星星得分：独立置顶一行，与按键表同款日期列（从近到远）+ 近 7 天合计
function renderScore(report) {
  if (!report || !report.score || report.score.total === 0) {
    scoreWrap.innerHTML = '<div class="empty">还没有得分记录，用泡泡打到黄色星星得分</div>';
    return;
  }
  const score = report.score;
  let html = '<table><thead><tr><th>打星星</th>';
  for (const day of score.days) {
    const cls = day.date === score.today ? ' class="today"' : '';
    html += `<th${cls}>${day.date.slice(5)} ${day.weekday}</th>`;
  }
  html += '<th>合计</th></tr></thead><tbody><tr><td>得分</td>';
  for (const day of score.days) {
    const cls = day.date === score.today ? ' class="today"' : '';
    html += `<td${cls}>${day.score ? day.score : ''}</td>`;
  }
  html += `<td><strong>${score.total}</strong></td></tr></tbody></table>`;
  scoreWrap.innerHTML = html;
}

function render(report) {
  if (!report) {
    wrap.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }
  const keySet = new Set();
  for (const day of report.days) {
    for (const key of Object.keys(day.counts)) keySet.add(key);
  }
  // 固定键盘顺序：0-9 → A-Z → ←/→，不随点击量浮动
  const STAT_ORDER = [...'0123456789', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '←', '→'];
  const keyRank = new Map(STAT_ORDER.map((key, index) => [key, index]));
  const keys = [...keySet].sort(
    (a, b) => (keyRank.get(a) ?? STAT_ORDER.length) - (keyRank.get(b) ?? STAT_ORDER.length),
  );
  if (keys.length === 0) {
    wrap.innerHTML = '<div class="empty">还没有按键记录</div>';
    return;
  }

  let html = '<table><thead><tr><th>按键</th>';
  for (const day of report.days) {
    const cls = day.date === report.today ? ' class="today"' : '';
    html += `<th${cls}>${day.date.slice(5)} ${day.weekday}</th>`;
  }
  html += '<th>按日合计</th></tr></thead><tbody>';

  for (const key of keys) {
    html += `<tr><td>${escapeHtml(key)}</td>`;
    for (const day of report.days) {
      const cls = day.date === report.today ? ' class="today"' : '';
      const count = day.counts[key] ?? 0;
      html += `<td${cls}>${count ? count : ''}</td>`;
    }
    html += `<td><strong>${report.totals[key] ?? 0}</strong></td></tr>`;
  }

  // 当日合计行：每列展示该日全部按键次数之和，最右为全期总计
  html += '<tr class="day-total"><td>当日合计</td>';
  let grandTotal = 0;
  for (const day of report.days) {
    const cls = day.date === report.today ? ' class="today"' : '';
    const daySum = Object.values(day.counts).reduce((sum, n) => sum + n, 0);
    grandTotal += daySum;
    html += `<td${cls}><strong>${daySum ? daySum : ''}</strong></td>`;
  }
  html += `<td><strong>${grandTotal}</strong></td></tr>`;
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

async function refresh() {
  const report = await window.desktop.getKeyStats();
  renderScore(report);
  render(report);
}

refresh();
setInterval(refresh, 2000);
