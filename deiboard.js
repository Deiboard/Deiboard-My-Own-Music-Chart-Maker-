function saveDB() { localStorage.setItem('deiboard_pro_v4_db', JSON.stringify(db)); }

function switchTab(t) {
var sections = document.querySelectorAll('.section');
for (var i = 0; i < sections.length; i++) sections[i].classList.remove('active');
var buttons = document.querySelectorAll('.nav button');
for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
document.getElementById(t).classList.add('active');
var btn = document.getElementById('btn-' + t);
if (btn) btn.classList.add('active');
if (t === 'history') updateHistorySelect(false);
if (t === 'settings') renderAlbumManage();
}

var db = null;
try { db = JSON.parse(localStorage.getItem('deiboard_pro_v4_db')); } catch(e) { db = null; }
if (!db) {
try { var v3 = JSON.parse(localStorage.getItem('deiboard_pro_v3_db'));
if (v3) { db = {charts: v3.charts || {}, settings: v3.settings || {size: 50}, albums: {}}; }
else { db = {charts: {}, settings: {size: 50}, albums: {}}; }
} catch(e2) { db = {charts: {}, settings: {size: 50}, albums: {}}; }
}
if (!db.albums) db.albums = {};
if (!db.settings) db.settings = {size: 50};

var editingList = [], dragSrcEl = null, lastWeekMap = {}, historyStatsMap = {}, cachedHistoryDate = null;
var calcViewMode = 'songs', calcResults = {songs: [], albums: [], artists: []};

document.addEventListener('DOMContentLoaded', function() {
document.getElementById('editor-date').value = getNextFriday();
document.getElementById('setting-size').value = db.settings.size;
updateHistorySelect(true); updateCalcScorePreview(); renderAlbumManage(); loadGithubSettings();
});

function getNextFriday() {
var d = new Date();
d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7));
return d.toISOString().split('T')[0];
}

function makeSongKey(t, a) { return t + '|' + a; }
function artistMatches(fullArtist, name) {
if (!fullArtist) return false;
var n = name.toLowerCase().trim();
var parts = fullArtist.split(/\s*&\s*/);
for (var i = 0; i < parts.length; i++) {
if (parts[i].trim().toLowerCase() === n) return true;
}
return false;
}



function getLastDate(d) {
var keys = Object.keys(db.charts).sort().reverse();
for (var i = 0; i < keys.length; i++) { if (keys[i] < d) return keys[i]; }
return null;
}

// Billboard 分层计分算法
function getPoints(rank) {
    if (rank > 50) return 0;
    if (rank <= 10) {
        // 1:36000, 2:24000, diff=12000; 3:22800(diff=1200); 4:21600(diff=1200) ... 10:15600
        var topScores = [36000,24000,22800,21600,20400,19440,18480,17520,16560,15600];
        return topScores[rank - 1];
    }
    if (rank <= 20) { return 6960 - (rank - 11) * 240; }
    if (rank <= 30) { return 4620 - (rank - 21) * 180; }
    if (rank <= 40) { return 2880 - (rank - 31) * 120; }
    return 1740 - (rank - 41) * 60; // 41-50
}

function escAttr(s) {
if (!s) return '';
return s.replace(/&/g,'&').replace(/'/g,'&#39;').replace(/"/g,'"').replace(/</g,'<').replace(/>/g,'>');
}

function escHtml(s) {
if (!s) return '';
return s.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>');
}

function loadEditorData() {
var date = document.getElementById('editor-date').value;
if (!date) { alert('请选择日期'); return; }
prepareComparisonData(date); editingList = [];
if (db.charts[date]) { editingList = JSON.parse(JSON.stringify(db.charts[date])); }
else { var ld = getLastDate(date); if (ld) editingList = JSON.parse(JSON.stringify(db.charts[ld])); }
var size = parseInt(db.settings.size) || 50;
while (editingList.length < size) editingList.push({title: '', artist: '', album: ''});
renderEditor(); renderReentry(date);
}

function prepareComparisonData(cd) {
lastWeekMap = {}; historyStatsMap = {};
var ld = getLastDate(cd);
if (ld && db.charts[ld]) {
for (var i = 0; i < db.charts[ld].length; i++)
lastWeekMap[makeSongKey(db.charts[ld][i].title, db.charts[ld][i].artist)] = db.charts[ld][i];
}
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
var d = dates[di]; if (d >= cd) continue;
for (var si = 0; si < db.charts[d].length; si++) {
var s = db.charts[d][si]; var k = makeSongKey(s.title, s.artist);
if (!historyStatsMap[k]) historyStatsMap[k] = {peak: 100, weeks: 0, exists: true};
historyStatsMap[k].weeks += 1;
if (s.rank < historyStatsMap[k].peak) historyStatsMap[k].peak = s.rank;
}}}

function calculateRealTimeStats(t, a, cr) {
if (!t) return {html: '', raw: {}};
var k = makeSongKey(t, a); var lw = lastWeekMap[k]; var h = historyStatsMap[k];
var st = 'New', sc = 'status-new', w = 1, pk = cr;
if (lw) {
var d1 = lw.rank - cr;
if (d1 > 0) { st = '⬆️ ' + d1; sc = 'status-up'; }
else if (d1 < 0) { st = '⬇️ ' + Math.abs(d1); sc = 'status-down'; }
else { st = '↔️'; sc = 'status-same'; }
if (h) { w = h.weeks + 1; pk = Math.min(cr, h.peak); }
} else {
if (h && h.exists) { st = 'Re-entry'; sc = 'status-re'; w = h.weeks + 1; pk = Math.min(cr, h.peak); }
}
var html = '<div class="stat-line-1 ' + sc + '"><span>' + st + '</span><span>#' + cr + '</span></div>';
html += '<div class="stat-line-2"><span>Wks: ' + w + '</span><span>Pk: ' + pk + '</span></div>';
return {html: html, raw: {weeks: w, peak: pk, status: st}};
}

function renderEditor() {
var c = document.getElementById('editor-list'); c.innerHTML = '';
var count = 0;
for (var i = 0; i < editingList.length; i++) { if (editingList[i].title) count++; }
document.getElementById('count-display').innerText = count;
for (var i = 0; i < editingList.length; i++) {
var s = editingList[i]; var r = i + 1;
var st = calculateRealTimeStats(s.title, s.artist, r);
if (s.title) s._computed = st.raw;
if (!s.album) s.album = '';
var akey = makeSongKey(s.title, s.artist);
if (db.albums[akey] && !s.album) s.album = db.albums[akey];
var row = document.createElement('div');
row.className = 'editor-row'; row.draggable = true; row.dataset.index = i;
var tv = escHtml(s.title || ''); var av = escHtml(s.artist || ''); var alv = escHtml(s.album || '');
row.innerHTML = '<div class="col-drag">☰</div>' +
'<div class="col-rank"><input type="number" value="' + r + '" onchange="manualRankChange(' + i + ',this.value)"></div>' +
'<div class="col-inputs">' +
'<input type="text" id="title-' + i + '" placeholder="歌名" value="' + tv + '" oninput="updateRow(' + i + ',\'title\',this.value)" onkeydown="handleKeyNav(event,' + i + ',\'title\')">' +
'<input type="text" id="artist-' + i + '" placeholder="歌手" value="' + av + '" oninput="updateRowArtist(' + i + ',this.value)" onkeydown="handleKeyNav(event,' + i + ',\'artist\')" onfocus="showAlbumSuggest(' + i + ')" onblur="hideAlbumSuggest(' + i + ')">' +
'</div>' +
'<div class="col-album"><input type="text" id="album-' + i + '" placeholder="专辑" value="' + alv + '" oninput="updateRow(' + i + ',\'album\',this.value)" onfocus="showAlbumSuggest(' + i + ')" onblur="hideAlbumSuggest(' + i + ')"><div class="album-suggest" id="album-suggest-' + i + '"></div></div>' +
'<div class="col-stats" id="stats-' + i + '">' + st.html + '</div>' +
'<div class="col-action"><button class="btn-icon" onclick="deleteSong(' + i + ')">✖</button></div>';
row.addEventListener('dragstart', function(e) { dragSrcEl = this; e.dataTransfer.effectAllowed = 'move'; this.classList.add('dragging'); });
row.addEventListener('dragover', function(e) { e.preventDefault(); });
row.addEventListener('dragenter', function(e) { e.preventDefault(); });
row.addEventListener('drop', handleDrop);
row.addEventListener('dragend', function() { this.classList.remove('dragging'); });
c.appendChild(row);
}}

function updateRow(i, f, v) {
editingList[i][f] = v;
var st = calculateRealTimeStats(editingList[i].title, editingList[i].artist, i + 1);
document.getElementById('stats-' + i).innerHTML = st.html;
editingList[i]._computed = st.raw;
var count = 0;
for (var j = 0; j < editingList.length; j++) { if (editingList[j].title) count++; }
document.getElementById('count-display').innerText = count;
}

function updateRowArtist(i, v) { editingList[i].artist = v; updateRow(i, 'artist', v); showAlbumSuggest(i); }

function getArtistAlbums(artistName) {
var albums = {}; var an = artistName.toLowerCase().trim();
var ak = Object.keys(db.albums);
for (var i = 0; i < ak.length; i++) {
var parts = ak[i].split('|');
if (parts.length >= 2 && parts[1].toLowerCase().indexOf(an) >= 0) {
var al = db.albums[ak[i]]; if (al && al !== 'Single') albums[al] = true;
}}
return Object.keys(albums).sort();
}

function showAlbumSuggest(i) {
var ai = editingList[i]; if (!ai || !ai.artist) return;
var box = document.getElementById('album-suggest-' + i); if (!box) return;
var albums = getArtistAlbums(ai.artist);
if (albums.length === 0) { box.style.display = 'none'; return; }
box.innerHTML = '';
for (var j = 0; j < albums.length; j++) {
var al = albums[j]; var div = document.createElement('div');
div.className = 'album-suggest-item'; div.innerText = '💿 ' + al;
div.onmousedown = (function(album, idx) {
return function(e) { e.preventDefault();
editingList[idx].album = album;
var inp = document.getElementById('album-' + idx); if (inp) inp.value = album;
var b = document.getElementById('album-suggest-' + idx); if (b) b.style.display = 'none';
};})(al, i);
box.appendChild(div);
}
box.style.display = 'block';
}

function hideAlbumSuggest(i) {
setTimeout(function() { var box = document.getElementById('album-suggest-' + i); if (box) box.style.display = 'none'; }, 200);
}

function manualRankChange(ci, nv) {
var nr = parseInt(nv); if (isNaN(nr) || nr < 1) { renderEditor(); return; }
if (nr > editingList.length) nr = editingList.length;
var ti = nr - 1; if (ti === ci) return;
editingList.splice(ti, 0, editingList.splice(ci, 1)[0]); renderEditor();
}

function handleDrop(e) {
e.stopPropagation(); if (dragSrcEl !== this) {
var si = parseInt(dragSrcEl.dataset.index); var ti = parseInt(this.dataset.index);
editingList.splice(ti, 0, editingList.splice(si, 1)[0]); renderEditor();
} return false;
}

function handleKeyNav(e, i, f) {
var m = editingList.length - 1;
if (e.key === 'Enter') { e.preventDefault();
if (f === 'title') document.getElementById('artist-' + i).focus();
else if (f === 'artist') document.getElementById('album-' + i).focus();
else if (i < m) document.getElementById('title-' + (i + 1)).focus();
}
if (e.key === 'ArrowDown' && i < m) document.getElementById(f + '-' + (i + 1)).focus();
if (e.key === 'ArrowUp' && i > 0) document.getElementById(f + '-' + (i - 1)).focus();
if (e.key === 'ArrowRight' && f === 'title') { e.preventDefault(); document.getElementById('artist-' + i).focus(); }
if (e.key === 'ArrowLeft' && f === 'artist') { e.preventDefault(); document.getElementById('title-' + i).focus(); }
}

function handleInsertKey(e, f) {
if (e.key === 'Enter') { e.preventDefault();
if (f === 'rank') document.getElementById('insert-title').focus();
if (f === 'title') document.getElementById('insert-artist').focus();
if (f === 'artist') document.getElementById('insert-album').focus();
if (f === 'album') insertSong();
}
if (e.key === 'ArrowDown') {
if (f === 'rank') document.getElementById('insert-title').focus();
if (f === 'title') document.getElementById('insert-artist').focus();
}}

function insertSong() {
var ri = document.getElementById('insert-rank'); var ti = document.getElementById('insert-title');
var ai = document.getElementById('insert-artist'); var rv = parseInt(ri.value);
var alInp = document.getElementById('insert-album');
if (!rv || !ti.value) return;
var idx = Math.min(Math.max(0, rv - 1), editingList.length);
editingList.splice(idx, 0, {title: ti.value, artist: ai.value, album: (alInp ? alInp.value : '')});
ri.value = ''; ti.value = ''; ai.value = ''; if (alInp) alInp.value = '';
ri.focus(); renderEditor();
}

function deleteSong(i) { editingList.splice(i, 1); renderEditor(); }

function renderReentry(currentDate) {
var allDates = Object.keys(db.charts).sort(); var ci = allDates.indexOf(currentDate);
var recentDates = allDates.slice(Math.max(0, ci - 10), ci);
var beforeSet = {};
for (var di = 0; di < recentDates.length; di++) {
var d = recentDates[di]; if (db.charts[d]) {
for (var si = 0; si < db.charts[d].length; si++)
beforeSet[makeSongKey(db.charts[d][si].title, db.charts[d][si].artist)] = true;
}}
var nowSet = {};
if (currentDate && allDates.indexOf(currentDate) >= 0 && db.charts[currentDate]) {
for (var si = 0; si < db.charts[currentDate].length; si++)
nowSet[makeSongKey(db.charts[currentDate][si].title, db.charts[currentDate][si].artist)] = true;
}
var candidates = []; var bk = Object.keys(beforeSet);
for (var ki = 0; ki < bk.length; ki++) {
var k = bk[ki]; if (nowSet[k]) continue;
var h = historyStatsMap[k]; if (!h || h.weeks > 20) continue;
var parts = k.split('|');
candidates.push({title: parts[0], artist: parts[1], weeks: h.weeks, peak: h.peak, key: k});
}
candidates.sort(function(a, b) { return a.weeks - b.weeks; });
var block = document.getElementById('reentry-block'), list = document.getElementById('reentry-list');
if (candidates.length === 0) { block.style.display = 'none'; return; }
block.style.display = 'block';
list.innerHTML = '<div style="font-size:11px;color:#888;margin-bottom:5px;">点击可快速添加到当前榜单末尾</div>';
for (var ci2 = 0; ci2 < candidates.length; ci2++) {
var ca = candidates[ci2]; var div = document.createElement('div'); div.className = 'reentry-item';
div.innerHTML = '<span>🎵 ' + escHtml(ca.title) + ' - ' + escHtml(ca.artist) + '</span><span style="color:#999">Wks:' + ca.weeks + ' Pk:#' + ca.peak + '</span>';
div.onclick = (function(cand) {
return function() { editingList.push({title: cand.title, artist: cand.artist, album: db.albums[cand.key] || ''}); renderEditor(); };
})(ca); list.appendChild(div);
}}

function saveChart() {
var date = document.getElementById('editor-date').value;
var cl = []; for (var i = 0; i < editingList.length; i++) { if (editingList[i].title && editingList[i].artist) cl.push(editingList[i]); }
if (cl.length === 0) { alert('榜单为空'); return; }
var allDates = Object.keys(db.charts).sort(); var ci = allDates.indexOf(date);
var prevSet = {};
if (ci > 0 && allDates[ci - 1] && db.charts[allDates[ci - 1]]) {
for (var si = 0; si < db.charts[allDates[ci - 1]].length; si++)
prevSet[makeSongKey(db.charts[allDates[ci - 1]][si].title, db.charts[allDates[ci - 1]][si].artist)] = true;
}
var newSet = {}; var fc = [];
for (var i = 0; i < cl.length; i++) {
var s = cl[i]; if (!s._computed) s._computed = calculateRealTimeStats(s.title, s.artist, i + 1).raw;
newSet[makeSongKey(s.title, s.artist)] = true;
if (s.album) db.albums[makeSongKey(s.title, s.artist)] = s.album;
fc.push({rank: i + 1, title: s.title, artist: s.artist, weeks: s._computed.weeks, peak: s._computed.peak, status: s._computed.status});
}
db.charts[date] = fc;
var newEntries = [], outEntries = [];
for (var i = 0; i < fc.length; i++) { var k = makeSongKey(fc[i].title, fc[i].artist); if (!prevSet[k]) newEntries.push(fc[i].title + ' - ' + fc[i].artist); }
var pk = Object.keys(prevSet);
for (var i = 0; i < pk.length; i++) { if (!newSet[pk[i]]) { var p = pk[i].split('|'); outEntries.push(p[0] + ' - ' + p[1]); } }
saveDB(); updateHistorySelect(false);
var sum = document.getElementById('save-summary'); sum.style.display = 'block';
var h = '<div class="summary-box"><b>✅ 榜单已保存！</b><br>';
if (newEntries.length > 0) h += '<b>🆕 新进/回榜 (' + newEntries.length + ')：</b>' + newEntries.join(' | ') + '<br>';
if (outEntries.length > 0) h += '<b>📤 出榜 (' + outEntries.length + ')：</b>' + outEntries.join(' | ') + '<br>';
if (newEntries.length === 0 && outEntries.length === 0) h += '榜单无变化。';
h += '<span id="cloud-status" style="color:#2980b9;font-size:12px;">☁️ 正在同步到 GitHub...</span>';
h += '</div>'; sum.innerHTML = h;
uploadToGitHub(function(ok, msg) {
var cs = document.getElementById('cloud-status');
if (cs) { cs.innerHTML = ok ? '☁️ GitHub 已同步 ✓ (' + msg + ')' : '☁️ GitHub 同步失败：' + msg; cs.style.color = ok ? '#27ae60' : '#c0392b'; }
});
}

function updateHistorySelect(il) {
var sel = document.getElementById('history-select'); var pv = sel.value;
var keys = Object.keys(db.charts).sort().reverse(); var opts = '';
for (var i = 0; i < keys.length; i++) opts += '<option value="' + keys[i] + '">' + keys[i] + '</option>';
sel.innerHTML = opts;
if (cachedHistoryDate && keys.indexOf(cachedHistoryDate) >= 0) sel.value = cachedHistoryDate;
else if (pv && keys.indexOf(pv) >= 0) sel.value = pv;
if (sel.value) renderHistoryView();
}

function onHistorySelectChange() { cachedHistoryDate = document.getElementById('history-select').value; renderHistoryView(); }

function renderHistoryView() {
var d = document.getElementById('history-select').value; cachedHistoryDate = d;
var c = db.charts[d]; var v = document.getElementById('history-view'); if (!c) { v.innerHTML = ''; return; }
var h = '<table class="history-table"><thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Album</th><th>Wks</th><th>Pk</th><th>Trend</th></tr></thead><tbody>';
for (var i = 0; i < c.length; i++) {
var s = c[i]; var cl = 'status-same';
if (s.status && s.status.indexOf('New') >= 0) cl = 'status-new';
if (s.status && s.status.indexOf('Re') >= 0) cl = 'status-re';
if (s.status && s.status.indexOf('⬆️') >= 0) cl = 'status-up';
if (s.status && s.status.indexOf('⬇️') >= 0) cl = 'status-down';
var an = db.albums[makeSongKey(s.title, s.artist)] || '';
var anEsc = an.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var alb = an ? '<span class="smart-link" onclick="goToAlbumPage(\'' + anEsc + '\')"><span class="album-tag' + (an === 'Single' ? ' single' : '') + '">' + escHtml(an) + '</span></span>' : '';
var artistHtml = '';
var parts = s.artist.split(/(\s*&\s*)/i);
for (var ai = 0; ai < parts.length; ai++) {
var ap = parts[ai];
if (/^\s*&\s*$/i.test(ap)) {
artistHtml += '<span class="split-text">' + escHtml(ap) + '</span>';
} else {
var cn = ap.trim();
if (cn) artistHtml += '<span class="smart-link" onclick="goToArtistPage(\'' + cn.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">' + escHtml(cn) + '</span>';
}}
var stEsc = s.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var saEsc = s.artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
h += '<tr><td>' + s.rank + '</td><td><span class="smart-link" onclick="goToSongTrend(\'' + stEsc + '\',\'' + saEsc + '\')">' + escHtml(s.title) + '</span></td><td>' + artistHtml + '</td><td>' + alb + '</td><td>' + s.weeks + '</td><td>' + s.peak + '</td><td class="' + cl + '">' + (s.status || '-') + '</td></tr>';
}
v.innerHTML = h + '</tbody></table>';
}

function jumpToHistoryDate(ds) {
switchTab('history');
setTimeout(function() { var sel = document.getElementById('history-select');
if (Object.keys(db.charts).indexOf(ds) >= 0) { sel.value = ds; cachedHistoryDate = ds; renderHistoryView(); }
else alert('日期 ' + ds + ' 的榜单不存在'); }, 50);
}

function goToArtistPage(n) { switchTab('search'); document.getElementById('search-input').value = n; performSearch(n, null, true); }
function goToSongTrend(t, a) { switchTab('search'); document.getElementById('search-input').value = t; performSearch(t, a); }
function goToAlbumPage(an) { switchTab('search'); document.getElementById('search-input').value = '💿' + an; renderAlbumPage(an); }
function editCurrentHistory() { var d = document.getElementById('history-select').value; document.getElementById('editor-date').value = d; switchTab('editor'); loadEditorData(); }
function deleteCurrentChart() { var d = document.getElementById('history-select').value; if (confirm('确定要删除 ' + d + ' 的榜单吗？')) { delete db.charts[d]; saveDB(); updateHistorySelect(false); if (document.getElementById('history-select').value) renderHistoryView(); else document.getElementById('history-view').innerHTML = ''; } }

var searchInput = document.getElementById('search-input'), suggestionBox = document.getElementById('search-suggestions');
searchInput.addEventListener('input', function() {
var val = this.value.toLowerCase().trim();
if (!val) { suggestionBox.style.display = 'none'; return; }
var matches = {}; var rawData = [];
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
var chart = db.charts[dates[di]];
for (var si = 0; si < chart.length; si++) {
var s = chart[si];
if (s.title.toLowerCase().indexOf(val) >= 0) {
var k = 's:' + makeSongKey(s.title, s.artist);
if (!matches[k]) { matches[k] = true; rawData.push({type: 'song', txt: s.title, art: s.artist}); }
}
if (s.artist.toLowerCase().indexOf(val) >= 0) {
if (!matches['a:' + s.artist]) { matches['a:' + s.artist] = true; rawData.push({type: 'artist', txt: s.artist}); }
var parts = s.artist.split(/\s*&\s*/);
for (var pi = 0; pi < parts.length; pi++) {
var cp = parts[pi].trim();
if (cp.toLowerCase().indexOf(val) >= 0 && !matches['a:' + cp]) { matches['a:' + cp] = true; rawData.push({type: 'artist', txt: cp}); }
}}}}
suggestionBox.innerHTML = '';
if (rawData.length > 0) {
suggestionBox.style.display = 'block';
var limit = Math.min(rawData.length, 12);
for (var i = 0; i < limit; i++) {
var item = rawData[i]; var div = document.createElement('div'); div.className = 'suggestion-item';
div.innerHTML = '<span>' + (item.type === 'song' ? '🎵' : '🎤') + ' ' + escHtml(item.txt) + ' ' + (item.art ? '- ' + escHtml(item.art) : '') + '</span>';
div.onclick = (function(it) {
return function() { searchInput.value = it.txt; suggestionBox.style.display = 'none';
if (it.type === 'song') performSearch(it.txt, it.art); else performSearch(it.txt, null, true); };
})(item); suggestionBox.appendChild(div);
}} else { suggestionBox.style.display = 'none'; }
});

function performSearch(qo, ea, im) {
var q = qo || searchInput.value.trim(); if (!q) return;
var rd = document.getElementById('search-results'); rd.innerHTML = '';
suggestionBox.style.display = 'none';
if (im) { renderArtistPage(q); return; }
var found = []; var seen = {};
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
var chart = db.charts[dates[di]];
for (var si = 0; si < chart.length; si++) {
var s = chart[si]; var k = makeSongKey(s.title, s.artist); if (seen[k]) continue;
var m = false;
if (ea) { if (s.title === q && s.artist === ea) m = true; }
else { if (s.title.toLowerCase() === q.toLowerCase()) m = true; }
if (m) { seen[k] = true; found.push(s); }
}}
if (found.length === 0) renderArtistPage(q);
else { for (var i = 0; i < found.length; i++) renderSongTrend(found[i].title, found[i].artist); }
}

function drawTrendChart(canvasId, segments, allDatesInRange) {
var canvas = document.getElementById(canvasId);
if (!canvas || allDatesInRange.length === 0) return;
var container = canvas.parentElement, tooltip = container.querySelector('.chart-tooltip');
var dpr = window.devicePixelRatio || 1;
var rect = canvas.getBoundingClientRect(); var W = rect.width, H = 280;
canvas.width = W * dpr; canvas.height = H * dpr;
canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
var pad = {top: 25, right: 25, bottom: 50, left: 45};
var plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
var allRanks = [];
for (var si = 0; si < segments.length; si++)
for (var pi = 0; pi < segments[si].length; pi++) allRanks.push(segments[si][pi].r);
if (allRanks.length === 0) return;
var minRank = Math.min.apply(null, allRanks), maxRank = Math.max.apply(null, allRanks);
var yMin = Math.max(1, minRank - Math.ceil((maxRank - minRank) * 0.15) - 1);
var yMax = maxRank + Math.ceil((maxRank - minRank) * 0.15) + 1;
var yRange = yMax - yMin || 1;

function xFor(i) { return pad.left + (i / Math.max(allDatesInRange.length - 1, 1)) * plotW; }
function yFor(r) { return pad.top + ((r - yMin) / yRange) * plotH; }
var dateIndexMap = {};
for (var i = 0; i < allDatesInRange.length; i++) dateIndexMap[allDatesInRange[i]] = i;
var allPoints = [];
ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fafbfc'; ctx.fillRect(0, 0, W, H);
ctx.strokeStyle = '#e8ecf0'; ctx.lineWidth = 0.5;
for (var i = 0; i <= 5; i++) {
var y = pad.top + (i / 5) * plotH;
ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
var val = Math.round(yMax - (i / 5) * yRange);
ctx.fillStyle = '#95a5a6'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
ctx.fillText('#' + val, pad.left - 8, y + 4);
}
ctx.textAlign = 'center'; ctx.font = '10px sans-serif';
var maxLabels = Math.min(allDatesInRange.length, 8);
var labelStep = Math.max(1, Math.floor(allDatesInRange.length / maxLabels));
for (var i = 0; i < allDatesInRange.length; i += labelStep) {
ctx.fillText(allDatesInRange[i].substring(2).replace(/-/g, '/'), xFor(i), H - pad.bottom + 18);
}
if ((allDatesInRange.length - 1) % labelStep !== 0) {
var li = allDatesInRange.length - 1;
ctx.fillText(allDatesInRange[li].substring(2).replace(/-/g, '/'), xFor(li), H - pad.bottom + 18);
}
for (var si = 0; si < segments.length; si++) {
var seg = segments[si]; if (seg.length === 0) continue;
var pts = [];
for (var pi = 0; pi < seg.length; pi++) {
var pt = {x: xFor(dateIndexMap[seg[pi].d]), y: yFor(seg[pi].r), r: seg[pi].r, d: seg[pi].d};
pts.push(pt); allPoints.push(pt);
}
if (pts.length === 1) continue;
ctx.beginPath(); ctx.moveTo(pts[0].x, pad.top + plotH); ctx.lineTo(pts[0].x, pts[0].y);
if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); }
else {
for (var i = 0; i < pts.length - 1; i++) {
var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
}
ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
ctx.lineTo(pts[pts.length - 1].x, pad.top + plotH); ctx.closePath();
var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
grad.addColorStop(0, 'rgba(41,128,185,0.18)'); grad.addColorStop(1, 'rgba(41,128,185,0.02)');
ctx.fillStyle = grad; ctx.fill();
ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); }
else {
for (var i = 0; i < pts.length - 1; i++) {
var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
}
ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 2.5; ctx.stroke();
}
for (var i = 0; i < allPoints.length; i++) {
var pt = allPoints[i]; var isPeak = pt.r === minRank;
ctx.beginPath(); ctx.arc(pt.x, pt.y, isPeak ? 6 : 4.5, 0, Math.PI * 2);
ctx.fillStyle = isPeak ? '#e74c3c' : '#2980b9'; ctx.fill();
ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}
ctx.fillStyle = '#7f8c8d'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('日期', W / 2, H - 5);
ctx.save(); ctx.translate(12, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('排名', 0, 0); ctx.restore();
canvas._chartData = allPoints; canvas._minRank = minRank;
canvas.onmousemove = function(e) {
var r = canvas.getBoundingClientRect(); var mx = e.clientX - r.left, my = e.clientY - r.top;
var closest = null, cd = Infinity;
for (var i = 0; i < allPoints.length; i++) {
var pt = allPoints[i]; var dx = pt.x - mx, dy = pt.y - my;
var dist = Math.sqrt(dx * dx + dy * dy); if (dist < cd) { cd = dist; closest = pt; }
}
if (closest && cd < 25) {
tooltip.innerHTML = '<strong>' + closest.d + '</strong><br>排名: <span style="color:' + (closest.r === minRank ? '#e74c3c' : '#fff') + ';font-weight:bold">#' + closest.r + '</span>' + (closest.r === minRank ? ' 🏆' : '');
tooltip.style.display = 'block'; tooltip.style.left = closest.x + 'px'; tooltip.style.top = closest.y + 'px';
canvas.style.cursor = 'pointer';
} else { tooltip.style.display = 'none'; canvas.style.cursor = 'default'; }
};
canvas.onmouseleave = function() { tooltip.style.display = 'none'; canvas.style.cursor = 'default'; };
}

function renderSongTrend(title, artist) {
var allDates = Object.keys(db.charts).sort(); var history = [];
var minRank = 100, totalWeeks = 0, totalPoints = 0;
for (var di = 0; di < allDates.length; di++) {
var d = allDates[di]; var hit = null;
for (var si = 0; si < db.charts[d].length; si++) {
if (db.charts[d][si].title === title && db.charts[d][si].artist === artist) { hit = db.charts[d][si]; break; }
}
if (hit) { history.push({d: d, r: hit.rank}); if (hit.rank < minRank) minRank = hit.rank; totalWeeks++; totalPoints += getPoints(hit.rank); }
}
if (history.length === 0) return;
var lastDate = history[history.length - 1].d;
var startIdx = allDates.indexOf(history[0].d), endIdx = allDates.indexOf(lastDate);
var allDatesInRange = allDates.slice(startIdx, endIdx + 1);
var segments = [], historyMap = {}, currentSeg = [];
for (var i = 0; i < history.length; i++) historyMap[history[i].d] = history[i].r;
for (var i = 0; i < allDatesInRange.length; i++) {
var d = allDatesInRange[i];
if (historyMap[d] !== undefined) { currentSeg.push({d: d, r: historyMap[d]}); }
else { if (currentSeg.length > 0) { segments.push(currentSeg); currentSeg = []; } }
}
if (currentSeg.length > 0) segments.push(currentSeg);
var trendStr = '', isOut = true, tableRows = ''; var cleanTableData = [];
for (var i = 0; i < allDatesInRange.length; i++) {
var d = allDatesInRange[i]; var hitR = historyMap[d];
var shortD = d.substring(2).replace(/-/g, '/');
if (hitR !== undefined) {
var rTxt = hitR === minRank ? '*' + hitR + '*' : hitR;
if (isOut) { trendStr += rTxt + '(' + shortD + ')-'; isOut = false; }
else trendStr += rTxt + '-';
tableRows += '<tr><td class="date-cell" onclick="jumpToHistoryDate(\'' + d + '\')" title="查看 ' + d + ' 榜单">' + d + '</td><td>' + hitR + '</td></tr>';
cleanTableData.push({d: d, r: hitR});
} else {
if (!isOut) { trendStr += 'out-'; isOut = true; }
tableRows += '<tr><td class="out-cell">' + d + '</td><td class="out-cell">— (出榜)</td></tr>';
}}
var latestDate = allDates[allDates.length - 1];
if (lastDate < latestDate && !isOut) trendStr += 'out';
if (trendStr.endsWith('-')) trendStr = trendStr.slice(0, -1);
var cleanDataStr = encodeURIComponent(JSON.stringify(cleanTableData));
var cardId = 'card-' + Math.random().toString(36).substr(2, 8);
var canvasId = 'canvas-' + Math.random().toString(36).substr(2, 8);
var songKey = makeSongKey(title, artist);
var albumName = db.albums[songKey] || '';
var albumDisplay = albumName ? '<span class="smart-link album-tag' + (albumName === 'Single' ? ' single' : '') + '" onclick="goToAlbumPage(\'' + albumName.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">💿 ' + escHtml(albumName) + '</span> <button class="album-edit-btn" onclick="editSongAlbum(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">✏️</button>' : '<span style="color:#aaa;font-size:12px;">未归类</span> <button class="album-edit-btn" onclick="editSongAlbum(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">💿 设置专辑</button>';

var artistLinksHtml = '';
var parts = artist.split(/(\s*&\s*)/i);
for (var ai = 0; ai < parts.length; ai++) {
var ap = parts[ai];
if (/^\s*&\s*$/i.test(ap)) { artistLinksHtml += '<span class="split-text">' + escHtml(ap) + '</span>'; }
else { var cn = ap.trim(); if (cn) artistLinksHtml += '<span class="smart-link" onclick="goToArtistPage(\'' + cn.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">' + escHtml(cn) + '</span>'; }
}

var div = document.createElement('div'); div.className = 'result-card'; div.id = cardId;
div._songTitle = title; div._songArtist = artist;
var inner = '<div style="display:flex;gap:8px;position:absolute;top:20px;right:20px;">';
inner += '<button class="btn btn-orange" style="font-size:12px;padding:5px 10px;" onclick="triggerEditSongTitle(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">🛠️ 修正歌名</button>';
inner += '<button class="btn btn-purple" style="font-size:12px;padding:5px 10px;" onclick="triggerEditSongArtist(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">🎤 修正歌手</button>';
inner += '</div>';
inner += '<h3 style="margin:0 0 5px 0;padding-right:200px;">🎵 <span id="' + cardId + '-title">' + escHtml(title) + '</span></h3>';
inner += '<p style="color:#666;margin:0;padding-right:200px;">🎤 <span id="' + cardId + '-artist">' + artistLinksHtml + '</span></p>';
inner += '<p style="margin:5px 0;padding-right:200px;" id="' + cardId + '-album">' + albumDisplay + '</p>';
inner += '<div class="song-stats-bar"><span>🏆 最高排名: <span class="stat-badge">#' + minRank + '</span></span><span>📅 在榜周数: <span class="stat-badge">' + totalWeeks + ' 周</span></span><span>🌟 总点数: <span class="stat-badge">' + totalPoints.toLocaleString() + ' pts</span></span><span>📊 走势段数: <span class="stat-badge">' + segments.length + '</span></span></div>';
inner += '<div class="trend-string-box">' + trendStr + '</div>';
inner += '<div class="chart-container"><canvas id="' + canvasId + '"></canvas><div class="chart-tooltip"></div><div class="chart-legend"><span class="legend-normal">常规排名</span><span class="legend-peak">最高排名</span><span class="legend-out">出榜间隙</span></div></div>';
inner += '<button class="btn btn-gray" onclick="copyTableClean(\'' + cleanDataStr + '\')">📋 复制表格到 Excel</button>';
inner += '<div style="font-size:12px;color:#999;margin-top:5px;">💡 点击日期可跳转查看当天榜单</div>';
inner += '<table class="trend-table"><thead><tr><th>日期</th><th>排名</th></tr></thead><tbody>' + tableRows + '</tbody></table>';
div.innerHTML = inner;
document.getElementById('search-results').prepend(div);
setTimeout(function() { drawTrendChart(canvasId, segments, allDatesInRange); }, 100);
}

function editSongAlbum(title, artist, cardId) {
var sk = makeSongKey(title, artist); var cur = db.albums[sk] || '';
var na = prompt('设置 "' + title + '" (' + artist + ') 的所属专辑:\n\n豪华版等变体请用标准名\n若为单曲请输入 Single\n留空表示未归类', cur);
if (na === null) return;
if (na.trim() === '') delete db.albums[sk]; else db.albums[sk] = na.trim();
saveDB(); var card = document.getElementById(cardId);
if (card) { var ae = card.querySelector('#' + cardId + '-album');
if (ae) { var an = db.albums[sk] || '';
ae.innerHTML = an ? '<span class="smart-link album-tag' + (an === 'Single' ? ' single' : '') + '" onclick="goToAlbumPage(\'' + an.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">💿 ' + escHtml(an) + '</span> <button class="album-edit-btn" onclick="editSongAlbum(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">✏️</button>' : '<span style="color:#aaa;font-size:12px;">未归类</span> <button class="album-edit-btn" onclick="editSongAlbum(\'' + escAttr(title) + '\',\'' + escAttr(artist) + '\',\'' + cardId + '\')">💿 设置专辑</button>';
}}}

function triggerEditSongTitle(ot, oa, cid) {
var nt = prompt('修改歌曲名:\n"' + ot + '"\n(歌手: ' + oa + ')', ot);
if (!nt || nt === ot) return;
var ok = makeSongKey(ot, oa); var c = 0;
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
if (db.charts[dates[di]][si].title === ot && db.charts[dates[di]][si].artist === oa) { db.charts[dates[di]][si].title = nt; c++; }
}}
if (db.albums[ok] !== undefined) { db.albums[makeSongKey(nt, oa)] = db.albums[ok]; delete db.albums[ok]; }
saveDB(); alert('✅ 已更新 ' + c + ' 条记录');
}

function triggerEditSongArtist(ot, oa, cid) {
var na = prompt('修改歌手名:\n"' + ot + '"\n原歌手: ' + oa, oa);
if (!na || na === oa) return;
var ok = makeSongKey(ot, oa); var c = 0;
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
if (db.charts[dates[di]][si].title === ot && db.charts[dates[di]][si].artist === oa) { db.charts[dates[di]][si].artist = na; c++; }
}}
if (db.albums[ok] !== undefined) { db.albums[makeSongKey(ot, na)] = db.albums[ok]; delete db.albums[ok]; }
saveDB(); alert('✅ 已更新 ' + c + ' 条记录');
}

function copyTableClean(ds) {
var data = JSON.parse(decodeURIComponent(ds));
var td = document.createElement('div'); td.style.position = 'fixed'; td.style.left = '-9999px';
var ts = 'border:none; background:none; font-family:SimSun,serif; font-size:11pt;';
var h = '<table border="0" cellspacing="0" cellpadding="0"><tbody>';
h += '<tr><td style="' + ts + '">日期</td><td style="' + ts + '">排名</td></tr>';
for (var i = 0; i < data.length; i++)
h += '<tr><td style="' + ts + '">' + data[i].d + '</td><td style="' + ts + '">' + data[i].r + '</td></tr>';
h += '</tbody></table>'; td.innerHTML = h; document.body.appendChild(td);
var range = document.createRange(); range.selectNodeContents(td);
var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
try { document.execCommand('copy'); alert('✅ 已复制！'); } catch (err) { alert('复制失败'); }
document.body.removeChild(td);
}

function renderArtistPage(name) {
var songsMap = {}; var albumMap = {};
var dates = Object.keys(db.charts);
/* First pass: compute global per-album scores (all songs, all artists) using Billboard points */
var globalAlbumScores = {};
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var sg = db.charts[dates[di]][si];
var pts = getPoints(sg.rank);
var an = db.albums[makeSongKey(sg.title, sg.artist)] || 'Single';
if (!globalAlbumScores[an]) globalAlbumScores[an] = 0;
globalAlbumScores[an] += pts;
}}
/* Second pass: compute per-singer songs and store album info */
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var s = db.charts[dates[di]][si];
if (artistMatches(s.artist, name)) {
if (!songsMap[s.title]) songsMap[s.title] = {peak: 100, weeks: 0, points: 0, fullArtist: s.artist, album: ''};
songsMap[s.title].weeks++;
if (s.rank < songsMap[s.title].peak) songsMap[s.title].peak = s.rank;
songsMap[s.title].points += getPoints(s.rank);
var sk = makeSongKey(s.title, s.artist); var an = db.albums[sk] || 'Single';
songsMap[s.title].album = an;
if (!albumMap[an]) albumMap[an] = {points: 0, songs: []};
albumMap[an].songs.push({title: s.title, artist: s.artist, points: songsMap[s.title].points, peak: songsMap[s.title].peak, weeks: songsMap[s.title].weeks});
}}}
/* Override per-album points with global album scores */
var albumKeys = Object.keys(albumMap);
for (var i = 0; i < albumKeys.length; i++) {
    var aname = albumKeys[i];
    albumMap[aname].points = globalAlbumScores[aname] || albumMap[aname].points;
}
var songKeys = Object.keys(songsMap); var songs = [];
for (var i = 0; i < songKeys.length; i++) {
songs.push({title: songKeys[i], peak: songsMap[songKeys[i]].peak, weeks: songsMap[songKeys[i]].weeks, points: songsMap[songKeys[i]].points, fullArtist: songsMap[songKeys[i]].fullArtist, album: songsMap[songKeys[i]].album});
}
songs.sort(function(a, b) { return b.points - a.points || a.peak - b.peak || b.weeks - a.weeks; });
var albumKeys2 = Object.keys(albumMap); var albums = [];
for (var i = 0; i < albumKeys2.length; i++) {
var a = albumKeys2[i];
albumMap[a].songs.sort(function(x, y) { return y.points - x.points; });
albums.push({name: a, points: albumMap[a].points, songs: albumMap[a].songs});
}
albums.sort(function(a, b) { return b.points - a.points; });
if (songs.length === 0) { document.getElementById('search-results').innerHTML = '<p align=center>未找到数据</p>'; return; }
var html = '<div class="result-card"><button class="btn btn-orange global-edit-btn" onclick="triggerGlobalRename(\'artist\',\'' + name.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',null)">🛠️ 修正歌手名</button><h2>🎤 ' + escHtml(name) + '</h2>';
html += '<h3 style="margin-top:20px;color:var(--primary);">🎵 单曲</h3><div class="artist-grid">';
for (var i = 0; i < songs.length; i++) {
var s = songs[i];
html += '<button class="btn artist-song-btn" onclick="performSearch(\'' + s.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',\'' + s.fullArtist.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">';
html += '<span>🎵 ' + escHtml(s.title) + '</span>';
html += '<span class="sub-info">🏆 ' + Math.round(s.points).toLocaleString() + ' pts | Peak:#' + s.peak + ' | Wks:' + s.weeks + '</span></button>';
}
html += '</div>';
if (albums.length > 0) {
html += '<h3 style="margin-top:25px;color:var(--purple);">💿 专辑</h3>';
for (var ai = 0; ai < albums.length; ai++) {
var al = albums[ai];
html += '<div class="album-card" onclick="goToAlbumPage(\'' + al.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">';
html += '<div style="display:flex;justify-content:space-between;font-weight:bold;">';
html += '<span>#' + (ai + 1) + ' 💿 ' + escHtml(al.name) + '</span>';
html += '<span>🏆 ' + Math.round(al.points).toLocaleString() + ' pts</span></div>';
html += '<div style="font-size:11px;color:#888;margin-top:3px;">' + al.songs.length + ' 首单曲</div>';
html += '</div>';
}}
html += '</div>';
document.getElementById('search-results').innerHTML = html;
}

function renderAlbumPage(albumName) {
var songs = {};
var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var s = db.charts[dates[di]][si];
var an = db.albums[makeSongKey(s.title, s.artist)] || 'Single';
if (an !== albumName) continue;
if (!songs[s.title]) songs[s.title] = {artist: s.artist, points: 0, peak: 100, weeks: 0};
songs[s.title].weeks++;
if (s.rank < songs[s.title].peak) songs[s.title].peak = s.rank;
songs[s.title].points += getPoints(s.rank);
}}
var songKeys = Object.keys(songs); var songList = []; var totalPts = 0;
for (var i = 0; i < songKeys.length; i++) {
var t = songKeys[i]; totalPts += songs[t].points;
songList.push({title: t, artist: songs[t].artist, points: songs[t].points, peak: songs[t].peak, weeks: songs[t].weeks});
}
songList.sort(function(a, b) { return b.points - a.points; });
if (songList.length === 0) { document.getElementById('search-results').innerHTML = '<p align=center>该专辑暂无数据</p>'; return; }
var artistSet = {};
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var s = db.charts[dates[di]][si];
if ((db.albums[makeSongKey(s.title, s.artist)] || 'Single') === albumName) artistSet[s.artist] = true;
}}
var artists = Object.keys(artistSet).sort();
var html = '<div class="result-card">';
html += '<h2>💿 ' + escHtml(albumName) + (albumName === 'Single' ? ' <span style="color:#27ae60;font-size:14px;">(单曲)</span>' : '') + '</h2>';
if (artists.length > 0) {
    var artistLinksHtml = '';
    for (var ai2 = 0; ai2 < artists.length; ai2++) {
        if (ai2 > 0) artistLinksHtml += ', ';
        var aEsc = artists[ai2].replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        artistLinksHtml += '<span class="smart-link" onclick="goToArtistPage(\'' + aEsc + '\')">' + escHtml(artists[ai2]) + '</span>';
    }
    html += '<p style="color:#666;">🎤 ' + artistLinksHtml + '</p>';
}
html += '<p style="color:var(--purple);font-weight:bold;font-size:15px;">🏆 总积分: ' + Math.round(totalPts).toLocaleString() + ' | 📀 ' + songList.length + ' 首单曲</p>';
html += '<table class="trend-table" style="margin-top:10px;"><thead><tr><th>#</th><th>单曲</th><th>歌手</th><th>积分</th><th>Peak</th><th>Wks</th></tr></thead><tbody>';
for (var i = 0; i < songList.length; i++) {
var s = songList[i];
html += '<tr><td>' + (i + 1) + '</td>';
html += '<td><span class="smart-link" onclick="performSearch(\'' + s.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',\'' + s.artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">' + escHtml(s.title) + '</span></td>';
    var artistHtml = '';
    var parts = s.artist.split(/(\s*&\s*)/i);
    for (var ai = 0; ai < parts.length; ai++) {
        var ap = parts[ai];
        if (/^\s*&\s*$/i.test(ap)) {
            artistHtml += '<span class="split-text">' + escHtml(ap) + '</span>';
        } else {
            var cn = ap.trim();
            if (cn) artistHtml += '<span class="smart-link" onclick="goToArtistPage(\'' + cn.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">' + escHtml(cn) + '</span>';
        }
    }
    html += '<td style="color:#666;">' + artistHtml + '</td>';
html += '<td style="font-weight:bold;color:var(--accent);">' + Math.round(s.points).toLocaleString() + '</td>';
html += '<td>#' + s.peak + '</td><td>' + s.weeks + '</td></tr>';
}
html += '</tbody></table></div>';
document.getElementById('search-results').innerHTML = html;
}

function triggerGlobalRename(type, on, oa) {
var pt = type === 'song' ? '修改歌曲: "' + on + '"\n(歌手: ' + oa + ')' : '修改歌手: "' + on + '"';
var nn = prompt(pt, on); if (!nn || nn === on) return;
var c = 0; var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var s = db.charts[dates[di]][si];
if (type === 'song') { if (s.title === on && s.artist === oa) { s.title = nn; c++; } }
else { if (s.artist.indexOf(on) >= 0) { s.artist = s.artist.replace(new RegExp(on.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), nn); c++; } }
}}
saveDB(); alert('✅ 已更新 ' + c + ' 条记录');
if (type === 'song') performSearch(nn, oa); else performSearch(nn, null, true);
}

function updateCalcScorePreview() {
var m = document.getElementById('calc-score-model').value;
var cp = document.getElementById('calc-custom-params');
if (m === 'custom') { cp.style.display = 'flex'; }
else { cp.style.display = 'none'; }
var preview = '';
var topScores = [36000,24000,22800,21600,20400,19440,18480,17520,16560,15600];
preview = '第1名 '+topScores[0].toLocaleString()+'分，第10名 '+topScores[9].toLocaleString()+'分，第50名 1,200分。';
document.getElementById('calc-score-preview-text').innerText = preview;
}

function switchCalcView(mode) { calcViewMode = mode;
var btns = document.querySelectorAll('.calc-tabs button');
for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
event.target.classList.add('active'); renderCalcView(); }

function calculateYearEnd() {
var fs = document.getElementById('calc-filter-date').value.trim();
var sm = document.getElementById('calc-sort-method').value;
var ss = {}; var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
var d = dates[di]; if (fs && !d.startsWith(fs)) continue;
for (var si = 0; si < db.charts[d].length; si++) {
var sg = db.charts[d][si]; if (!sg.title) continue;
var k = makeSongKey(sg.title, sg.artist);
if (!ss[k]) ss[k] = {title: sg.title, artist: sg.artist, points: 0, weeks: 0, peak: 100, weeksAt1: 0, weeksAt2: 0, weeksTop3: 0, weeksTop5: 0, weeksTop10: 0, album: db.albums[k] || ''};
ss[k].points += getPoints(sg.rank); ss[k].weeks += 1;
if (sg.rank < ss[k].peak) ss[k].peak = sg.rank;
if (sg.rank === 1) ss[k].weeksAt1++; if (sg.rank === 2) ss[k].weeksAt2++;
if (sg.rank <= 3) ss[k].weeksTop3++; if (sg.rank <= 5) ss[k].weeksTop5++; if (sg.rank <= 10) ss[k].weeksTop10++;
}}
var sv = []; var skeys = Object.keys(ss); for (var i = 0; i < skeys.length; i++) sv.push(ss[skeys[i]]);
sv.sort(function(a, b) {
if (sm === 'top1' && a.weeksAt1 !== b.weeksAt1) return b.weeksAt1 - a.weeksAt1;
if (sm === 'top2' && a.weeksAt2 !== b.weeksAt2) return b.weeksAt2 - a.weeksAt2;
if (sm === 'top3' && a.weeksTop3 !== b.weeksTop3) return b.weeksTop3 - a.weeksTop3;
if (sm === 'top5' && a.weeksTop5 !== b.weeksTop5) return b.weeksTop5 - a.weeksTop5;
if (sm === 'top10' && a.weeksTop10 !== b.weeksTop10) return b.weeksTop10 - a.weeksTop10;
if (b.points !== a.points) return b.points - a.points; if (a.peak !== b.peak) return a.peak - b.peak; return b.weeks - a.weeks; });
var am = {}; for (var i = 0; i < sv.length; i++) {
var so = sv[i]; var an = so.album || 'Single';
if (!am[an]) am[an] = {name: an, points: 0, songs: [], artists: []};
am[an].points += so.points; am[an].songs.push(so);
if (am[an].artists.indexOf(so.artist) < 0) am[an].artists.push(so.artist); }
var al = []; var akeys = Object.keys(am); for (var i = 0; i < akeys.length; i++) al.push(am[akeys[i]]);
al.sort(function(a, b) { return b.points - a.points; });
var arm = {}; for (var i = 0; i < sv.length; i++) {
var so = sv[i]; var ma = so.artist.split(/\s*&\s*/)[0].trim();
if (!arm[ma]) arm[ma] = {name: ma, points: 0, songs: []};
arm[ma].points += so.points; arm[ma].songs.push(so); }
var arl = []; var rkeys = Object.keys(arm); for (var i = 0; i < rkeys.length; i++) arl.push(arm[rkeys[i]]);
arl.sort(function(a, b) { return b.points - a.points; });
calcResults = {songs: sv, albums: al, artists: arl};
document.getElementById('calc-result-area').style.display = 'block'; renderCalcView(); }

function renderCalcView() {
var data = calcResults[calcViewMode]; var tb = document.getElementById('calc-table-body'); var th = document.getElementById('calc-table-head');
document.getElementById('calc-count').innerText = data.length;
document.getElementById('calc-result-area').style.display = 'block';
if (calcViewMode === 'songs') {
document.getElementById('calc-title').innerText = '歌曲';
th.innerHTML = '<tr><th>顺位</th><th>歌曲</th><th>歌手</th><th>总积分</th><th>冠/亚/T3/T5/T10</th><th>最高</th><th>周数</th></tr>';
tb.innerHTML = ''; var mp = data.length > 0 ? data[0].points : 1;
for (var i = 0; i < data.length; i++) {
var s = data[i]; var r = i + 1; var rc = r === 1 ? 'medal-1' : r === 2 ? 'medal-2' : r === 3 ? 'medal-3' : '';
var stEsc = s.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var saEsc = s.artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var artistLink = '';
var parts = s.artist.split(/(\s*&\s*)/i);
for (var ai = 0; ai < parts.length; ai++) {
var ap = parts[ai];
if (/^\s*&\s*$/i.test(ap)) { artistLink += '<span class="split-text">' + escHtml(ap) + '</span>'; }
else { var cn = ap.trim(); if (cn) artistLink += '<span class="smart-link" onclick="goToArtistPage(\'' + cn.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">' + escHtml(cn) + '</span>'; }
}
var row = document.createElement('tr');
row.innerHTML = '<td class="' + rc + '">#' + r + '</td><td><span class="smart-link" onclick="goToSongTrend(\'' + stEsc + '\',\'' + saEsc + '\')">' + escHtml(s.title) + '</span></td><td style="color:#666">' + artistLink + '</td><td><span style="font-weight:bold;color:var(--purple)">' + Math.round(s.points).toLocaleString() + '</span><div class="score-bar"><div class="score-fill" style="width:' + (s.points / mp * 100) + '%"></div></div></td><td><span class="stat-badge-calc ' + (s.weeksAt1 > 0 ? 'highlight' : '') + '">👑' + s.weeksAt1 + '</span><span class="stat-badge-calc">🥈' + s.weeksAt2 + '</span><span class="stat-badge-calc">T3:' + s.weeksTop3 + '</span><span class="stat-badge-calc">T5:' + s.weeksTop5 + '</span><span class="stat-badge-calc">T10:' + s.weeksTop10 + '</span></td><td style="text-align:center">' + s.peak + '</td><td style="text-align:center">' + s.weeks + '</td>';
tb.appendChild(row); }
} else if (calcViewMode === 'albums') {
document.getElementById('calc-title').innerText = '专辑';
th.innerHTML = '<tr><th>顺位</th><th>专辑</th><th>歌曲数</th><th>总积分</th><th>收录歌曲(Top10)</th></tr>';
tb.innerHTML = ''; var mp = data.length > 0 ? data[0].points : 1;
for (var i = 0; i < data.length; i++) {
var a = data[i]; var r = i + 1; var rc = r === 1 ? 'medal-1' : r === 2 ? 'medal-2' : r === 3 ? 'medal-3' : '';
var alEsc = a.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var ts = '';
for (var j = 0; j < Math.min(a.songs.length, 10); j++) {
if (j > 0) ts += ', ';
var se = a.songs[j].title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var ae = a.songs[j].artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
ts += '<span class="smart-link" onclick="goToSongTrend(\'' + se + '\',\'' + ae + '\')">' + escHtml(a.songs[j].title) + '</span>';
}
var row = document.createElement('tr');
row.innerHTML = '<td class="' + rc + '">#' + r + '</td><td><span class="smart-link" onclick="goToAlbumPage(\'' + alEsc + '\')">💿 ' + escHtml(a.name) + '</span></td><td style="text-align:center">' + a.songs.length + '</td><td><span style="font-weight:bold;color:var(--purple)">' + Math.round(a.points).toLocaleString() + '</span><div class="score-bar"><div class="score-fill" style="width:' + (a.points / mp * 100) + '%"></div></div></td><td style="font-size:12px;color:#666">' + ts + '</td>';
tb.appendChild(row); }
} else if (calcViewMode === 'artists') {
document.getElementById('calc-title').innerText = '艺人';
th.innerHTML = '<tr><th>顺位</th><th>艺人</th><th>歌曲数</th><th>总积分</th><th>代表歌曲(Top5)</th></tr>';
tb.innerHTML = ''; var mp = data.length > 0 ? data[0].points : 1;
for (var i = 0; i < data.length; i++) {
var a = data[i]; var r = i + 1; var rc = r === 1 ? 'medal-1' : r === 2 ? 'medal-2' : r === 3 ? 'medal-3' : '';
var arEsc = a.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var ts = '';
for (var j = 0; j < Math.min(a.songs.length, 5); j++) {
if (j > 0) ts += ', ';
var se = a.songs[j].title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
var ae = a.songs[j].artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
ts += '<span class="smart-link" onclick="goToSongTrend(\'' + se + '\',\'' + ae + '\')">' + escHtml(a.songs[j].title) + '</span>';
}
var row = document.createElement('tr');
row.innerHTML = '<td class="' + rc + '">#' + r + '</td><td><span class="smart-link" onclick="goToArtistPage(\'' + arEsc + '\')">🎤 ' + escHtml(a.name) + '</span></td><td style="text-align:center">' + a.songs.length + '</td><td><span style="font-weight:bold;color:var(--purple)">' + Math.round(a.points).toLocaleString() + '</span><div class="score-bar"><div class="score-fill" style="width:' + (a.points / mp * 100) + '%"></div></div></td><td style="font-size:12px;color:#666">' + ts + '</td>';
tb.appendChild(row); }
}}
function copyCalcTable() {
var el = document.getElementById('calc-result-table');
var range = document.createRange(); range.selectNodeContents(el);
var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
try { document.execCommand('copy'); alert('✅ 已复制！'); } catch (e) { alert('复制失败'); } }

function renderAlbumManage() {
var q = ''; var searchEl = document.getElementById('album-search');
if (searchEl && searchEl.value) q = searchEl.value.toLowerCase().trim();
var songs = {}; var dates = Object.keys(db.charts);
for (var di = 0; di < dates.length; di++) {
for (var si = 0; si < db.charts[dates[di]].length; si++) {
var s = db.charts[dates[di]][si]; if (!s.title) continue;
var k = makeSongKey(s.title, s.artist); if (!songs[k]) songs[k] = {title: s.title, artist: s.artist};
}}
var entries = []; var skeys = Object.keys(songs); for (var i = 0; i < skeys.length; i++) entries.push(songs[skeys[i]]);
if (q) entries = entries.filter(function(s) { return s.title.toLowerCase().indexOf(q) >= 0 || s.artist.toLowerCase().indexOf(q) >= 0; });
entries.sort(function(a, b) { return a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist); });
document.getElementById('album-manage-count').innerText = entries.length + ' 首歌曲';
var tb = document.getElementById('album-manage-body'); if (!tb) return; tb.innerHTML = '';
for (var i = 0; i < entries.length; i++) {
var s = entries[i]; var k = makeSongKey(s.title, s.artist); var al = db.albums[k] || '';
var tr = document.createElement('tr');
tr.innerHTML = '<td>🎵 ' + escHtml(s.title) + '</td><td style="color:#666">' + escHtml(s.artist) + '</td><td><input type="text" value="' + escHtml(al) + '" placeholder="专辑名 或 Single" onchange="setAlbumManual(\'' + s.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',\'' + s.artist.replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',this.value)" style="width:200px;padding:4px 8px;font-size:12px;"></td>';
tb.appendChild(tr); } }

function setAlbumManual(t, a, v) { var k = makeSongKey(t, a); var vv = v.trim(); if (vv === '') delete db.albums[k]; else db.albums[k] = vv; saveDB(); }
function autoNormalizeAlbums() {
var norm = function(n) { return n.replace(/\s*\(Deluxe.*?\)/gi, '').replace(/\s*\(Expanded.*?\)/gi, '').replace(/\s*\(Bonus.*?\)/gi, '').replace(/\s*\(Special.*?\)/gi, '').replace(/\s+Deluxe\s+Edition/gi, '').trim(); };
var ch = 0; var keys = Object.keys(db.albums);
for (var i = 0; i < keys.length; i++) { var o = db.albums[keys[i]]; if (!o || o === 'Single') continue; var nn = norm(o); if (nn !== o) { db.albums[keys[i]] = nn; ch++; } }
saveDB(); alert('✅ 已合并 ' + ch + ' 条专辑名称'); renderAlbumManage(); }

function exportData() { var dataCopy = JSON.parse(JSON.stringify(db)); if (dataCopy.settings && dataCopy.settings.github) delete dataCopy.settings.github.token; var b = new Blob([JSON.stringify(dataCopy)], {type: 'application/json'}); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'deiboard_backup_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); }
function importDataTrigger() { document.getElementById('import-file').click(); }
function importData(el) { var f = el.files[0]; if (!f) return; var r = new FileReader(); r.onload = function(e) { try { var im = JSON.parse(e.target.result); db = {charts: im.charts || {}, settings: im.settings || {size: 50}, albums: im.albums || {}}; saveDB(); location.reload(); } catch (x) { alert('文件格式错误'); } }; r.readAsText(f); }
function clearAllData() { if (confirm('⚠️ 确定清空所有数据?')) { localStorage.removeItem('deiboard_pro_v4_db'); location.reload(); } }
function saveSettings() { db.settings.size = document.getElementById('setting-size').value; saveDB(); alert('已保存'); }

function getGithubConfig() {
var g = (db.settings && db.settings.github) || {};
return {token: g.token || '', owner: g.owner || 'Deiboard', repo: g.repo || 'Deiboard-My-Own-Music-Chart-Maker-', path: g.path || 'deiboard_data.json'};
}

function loadGithubSettings() {
var g = getGithubConfig(); var el;
if ((el = document.getElementById('github-token'))) el.value = g.token;
if ((el = document.getElementById('github-owner'))) el.value = g.owner;
if ((el = document.getElementById('github-repo'))) el.value = g.repo;
if ((el = document.getElementById('github-path'))) el.value = g.path;
}

function saveGithubSettings() {
if (!db.settings.github) db.settings.github = {};
db.settings.github.token = document.getElementById('github-token').value.trim();
db.settings.github.owner = document.getElementById('github-owner').value.trim() || 'Deiboard';
db.settings.github.repo = document.getElementById('github-repo').value.trim() || 'Deiboard-My-Own-Music-Chart-Maker-';
db.settings.github.path = document.getElementById('github-path').value.trim() || 'deiboard_data.json';
saveDB();
document.getElementById('github-status').innerText = '✅ 配置已保存';
}

function uploadToGitHub(callback) {
var cfg = getGithubConfig();
if (!cfg.token) { if (callback) callback(false, '未配置 GitHub Token（在「设置」中填写）'); return; }
var base = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
var dataCopy = JSON.parse(JSON.stringify(db));
if (dataCopy.settings && dataCopy.settings.github) delete dataCopy.settings.github.token;
var content = JSON.stringify(dataCopy, null, 2);
var encoded = btoa(unescape(encodeURIComponent(content)));
var authHeaders = {'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json'};
fetch(base + '/contents/' + encodeURIComponent(cfg.path), {headers: authHeaders})
.then(function(r) { return r.json(); })
.then(function(info) {
var body = {message: 'Update chart data ' + new Date().toISOString().slice(0, 19).replace('T', ' '), content: encoded};
if (info && info.sha) body.sha = info.sha;
var h = {'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'};
return fetch(base + '/contents/' + encodeURIComponent(cfg.path), {method: 'PUT', headers: h, body: JSON.stringify(body)});
})
.then(function(r) { return r.json(); })
.then(function(res) {
if (res && res.commit) { if (callback) callback(true, '已同步 ' + Object.keys(db.charts).length + ' 期榜单'); }
else { if (callback) callback(false, (res && res.message) || '上传失败'); }
})
.catch(function(e) { if (callback) callback(false, e.message); });
}

function testGithubUpload() {
var st = document.getElementById('github-status'); st.innerText = '⏳ 上传中...';
uploadToGitHub(function(ok, msg) { st.innerText = (ok ? '✅ ' : '❌ ') + msg; });
}