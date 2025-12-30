export const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcription Tester</title>
<style>
:root {
  --bg: #f8f9fb;
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #1a202c;
  --muted: #718096;
  --primary: #4f46e5;
  --primary-h: #4338ca;
  --success: #10b981;
  --danger: #ef4444;
  --radius: 10px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding: 28px 20px;
}
.wrap { max-width: 660px; margin: 0 auto; }
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
header h1 { font-size: 19px; font-weight: 700; letter-spacing: -0.3px; }
.status { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e0; flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.err { background: var(--danger); }
.svc-strip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
  font-size: 12px;
  color: var(--muted);
}
.svc-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #cbd5e0;
  flex-shrink: 0;
  transition: background .2s;
}
.svc-dot.active { background: var(--primary); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.card-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--muted);
  margin-bottom: 14px;
}
.row { display: flex; gap: 12px; }
.field { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 13px; font-weight: 500; color: var(--muted); }
select, input[type="number"], input[type="text"] {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--surface);
  color: var(--text);
  width: 100%;
}
select {
  padding-right: 30px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23718096' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  appearance: none;
  cursor: pointer;
}
#langDrop {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 100;
  margin-top: 2px;
  box-shadow: 0 4px 12px rgba(0,0,0,.18);
}
#langDrop div {
  padding: 8px 10px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
#langDrop div:hover, #langDrop div.active {
  background: var(--primary);
  color: #fff;
}
select:focus, input[type="number"]:focus, input[type="text"]:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(79,70,229,.12);
}
input[type="number"] { -moz-appearance: textfield; }
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
.toggles-row {
  display: flex;
  gap: 20px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  user-select: none;
}
.toggle input[type="checkbox"] { display: none; }
.toggle-track {
  width: 36px; height: 20px;
  background: #cbd5e0;
  border-radius: 10px;
  position: relative;
  transition: background .15s;
  flex-shrink: 0;
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform .15s;
  box-shadow: 0 1px 2px rgba(0,0,0,.2);
}
.toggle input:checked + .toggle-track { background: var(--primary); }
.toggle input:checked + .toggle-track::after { transform: translateX(16px); }
.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.model-row:last-child { border-bottom: none; }
.model-row-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text); }
.model-row-size { font-size: 12px; color: var(--muted); width: 58px; text-align: right; flex-shrink: 0; }
.model-row-status { min-width: 120px; text-align: center; flex-shrink: 0; }
.model-row-action { width: 82px; text-align: right; flex-shrink: 0; }
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 8px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: all .15s;
  color: var(--muted);
  display: block;
  user-select: none;
}
.drop-zone:hover { border-color: var(--primary); color: var(--primary); background: rgba(79,70,229,.03); }
.drop-zone.over { border-color: var(--primary); background: rgba(79,70,229,.06); color: var(--primary); }
.drop-zone.ready { border-color: var(--success); background: rgba(16,185,129,.05); color: #065f46; }
.drop-icon { font-size: 26px; margin-bottom: 8px; }
.drop-title { font-size: 14px; font-weight: 500; margin-bottom: 3px; }
.drop-sub { font-size: 12px; }
#fileInput { display: none; }
.divider {
  display: flex; align-items: center; gap: 12px;
  margin: 14px 0;
  font-size: 12px; color: var(--muted);
}
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  transition: all .15s;
  background: var(--surface);
  color: var(--text);
  width: 100%;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-record:not(:disabled):hover { border-color: var(--danger); color: var(--danger); }
.btn-record.active { border-color: var(--danger); color: var(--danger); background: rgba(239,68,68,.04); }
.rec-dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.btn-record.active .rec-dot { animation: blink .9s ease-in-out infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
.timer { text-align: center; font-size: 13px; color: var(--muted); min-height: 18px; margin-top: 8px; }
.btn-go {
  width: 100%;
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 13px;
  font-size: 15px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.btn-go:not(:disabled):hover { background: var(--primary-h); }
.result-area {
  min-height: 90px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 14px;
  font-size: 15px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.result-area.empty { color: var(--muted); font-style: italic; }
.meta { display: flex; gap: 18px; margin-top: 10px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.meta b { font-weight: 600; color: #4a5568; }
.copy-btn {
  font-size: 12px; padding: 3px 10px;
  border: 1px solid var(--border); border-radius: 5px;
  background: none; cursor: pointer; color: var(--muted);
  transition: all .15s;
}
.copy-btn:hover { border-color: var(--primary); color: var(--primary); }
.err-box {
  background: rgba(239,68,68,.07);
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 7px;
  padding: 12px 16px;
  font-size: 13px;
  color: #b91c1c;
  margin-bottom: 14px;
}
.model-state-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
  font-size: 13px;
  gap: 12px;
}
.model-state-left { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.model-state-left .dot { flex-shrink: 0; }
.model-state-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.badge {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  background: #e2e8f0;
  color: #4a5568;
  letter-spacing: .03em;
}
.badge.persistent { background: #dbeafe; color: #1e40af; }
.badge.warm { background: #fef3c7; color: #92400e; }
.badge.ephemeral { background: #f0fdf4; color: #166534; }
.badge-dl { background: #f0fdf4; color: #166534; }
.badge-loaded { background: #dbeafe; color: #1e40af; }
.badge-downloading { background: #fef3c7; color: #92400e; }
.btn-unload {
  font-size: 12px; padding: 3px 11px;
  border: 1px solid rgba(239,68,68,.4); border-radius: 5px;
  background: none; cursor: pointer; color: var(--danger);
  transition: all .15s;
}
.btn-unload:hover { background: rgba(239,68,68,.07); }
.btn-unload:disabled { opacity: .45; cursor: not-allowed; }
.btn-dl {
  font-size: 12px; padding: 3px 11px;
  border: 1px solid var(--primary); border-radius: 5px;
  background: none; cursor: pointer; color: var(--primary);
  transition: all .15s;
  white-space: nowrap;
}
.btn-dl:hover { background: rgba(79,70,229,.07); }
.btn-dl:disabled { opacity: .45; cursor: not-allowed; }
.loading { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; }
.spin {
  width: 15px; height: 15px;
  border: 2px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .65s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.word-timing-area {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.word-timing-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.word-timing-label {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted);
}
.word-timing-note {
  font-size: 11px; color: var(--muted);
  font-style: italic; max-width: 55%;
  text-align: right;
}
.word-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  line-height: 1;
}
.word-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 4px 7px;
  cursor: default;
}
.word-chip:hover { border-color: #a0aec0; background: #edf2f7; }
.chip-word { font-size: 13px; color: var(--text); }
.chip-ts { font-size: 10px; color: var(--muted); font-family: ui-monospace, monospace; white-space: nowrap; }
.diarize-state-bar {
  display: flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
  font-size: 13px;
  gap: 8px;
  color: var(--muted);
}
.segment-area {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.segment {
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
}
.segment:last-child { border-bottom: none; }
.segment-header { display: flex; align-items: center; gap: 9px; margin-bottom: 5px; }
.segment-speaker {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .06em;
  padding: 2px 8px; border-radius: 20px;
  color: #fff; flex-shrink: 0;
}
.segment-time { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.segment-text { font-size: 15px; line-height: 1.65; }
#numSpeakersRow { margin-top: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Transcription Tester</h1>
    <div class="status">
      <div class="dot" id="dot"></div>
      <span id="statusTxt">Connecting\\u2026</span>
    </div>
  </header>

  <div class="svc-strip">
    <div class="svc-dot" id="svcDot"></div>
    <span id="svcLabel">\\u2014</span>
    <span class="badge" id="queueBadge" style="display:none"></span>
  </div>

  <div id="errBox" class="err-box" style="display:none"></div>

  <div class="model-state-bar" id="modelStateBar">
    <div class="model-state-left">
      <div class="dot" id="modelDot"></div>
      <span id="modelStateTxt">Checking memory\\u2026</span>
    </div>
    <div class="model-state-right">
      <span class="badge" id="ttlBadge" style="display:none"></span>
      <button class="btn-unload" id="unloadBtn" style="display:none">Unload</button>
    </div>
  </div>

  <div class="diarize-state-bar" id="diarizeStateBar" style="display:none">
    <div class="dot" id="diarizeDot"></div>
    <span id="diarizeStateTxt"></span>
  </div>

  <div class="card">
    <div class="card-label">Models</div>
    <div id="modelsList">
      <div class="loading"><div class="spin"></div> Loading\\u2026</div>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Settings</div>
    <div class="row">
      <div class="field">
        <label for="modelSel">Model</label>
        <select id="modelSel"><option value="">Loading\\u2026</option></select>
      </div>
      <div class="field">
        <label for="langInput">Language</label>
        <div id="langWrap" style="position:relative">
          <input id="langInput" type="text" placeholder="Auto-detect" autocomplete="off">
          <input id="langSel" type="hidden" value="">
          <div id="langDrop"></div>
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="field">
        <label for="ttlInput">Model TTL override (seconds, blank = use config)</label>
        <input type="number" id="ttlInput" placeholder="0 = ephemeral, -1 = persistent, N = keep-warm" min="-1">
      </div>
    </div>
    <div class="toggles-row">
      <label class="toggle">
        <input type="checkbox" id="streamToggle" checked>
        <span class="toggle-track"></span>
        <span>SSE streaming</span>
      </label>
      <label class="toggle">
        <input type="checkbox" id="timestampToggle">
        <span class="toggle-track"></span>
        <span>Word timestamps</span>
      </label>
      <label class="toggle">
        <input type="checkbox" id="diarizeToggle">
        <span class="toggle-track"></span>
        <span>Diarise speakers</span>
      </label>
    </div>
    <div id="numSpeakersRow" class="row" style="display:none">
      <div class="field">
        <label for="numSpeakersInput">Number of speakers (optional \\u2014 improves accuracy when known)</label>
        <input type="number" id="numSpeakersInput" placeholder="Auto-detect" min="1" max="20">
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Audio Input</div>
    <label class="drop-zone" id="dropZone" for="fileInput">
      <div class="drop-icon">&#128193;</div>
      <div class="drop-title" id="dropTitle">Drop an audio file here</div>
      <div class="drop-sub" id="dropSub">or click to choose a file</div>
      <input type="file" id="fileInput" accept="audio/*">
    </label>
    <div class="divider">or record directly</div>
    <button class="btn btn-record" id="recBtn">
      <span class="rec-dot"></span>
      <span id="recTxt">Start Recording</span>
    </button>
    <div class="timer" id="timer"></div>
  </div>

  <button class="btn btn-go" id="goBtn" disabled>&#9654;&#160; Transcribe</button>

  <div class="card">
    <div class="card-label" style="display:flex;justify-content:space-between;align-items:center">
      <span>Transcript</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="copy-btn" id="downloadBtn" style="display:none">Download</button>
        <button class="copy-btn" id="copyBtn" style="display:none">Copy</button>
      </div>
    </div>
    <div class="result-area empty" id="result">Transcript will appear here.</div>
    <div class="word-timing-area" id="wordTimingArea" style="display:none">
      <div class="word-timing-header">
        <span class="word-timing-label">Word Timings</span>
        <span class="word-timing-note" id="wordTimingNote"></span>
      </div>
      <div class="word-chips" id="wordChips"></div>
    </div>
    <div class="segment-area" id="segmentArea" style="display:none">
      <div class="word-timing-header">
        <span class="word-timing-label">Speakers</span>
        <span class="word-timing-note" id="speakerCount"></span>
      </div>
      <div id="segmentList"></div>
    </div>
    <div class="meta" id="meta" style="display:none">
      <span><b>Duration</b> <span id="mDur">\\u2014</span></span>
      <span><b>Model</b> <span id="mMod">\\u2014</span></span>
      <span><b>Language</b> <span id="mLang">\\u2014</span></span>
      <span id="mSegmented" style="display:none"><b>Segmented</b> yes</span>
    </div>
  </div>
</div>
<script>
(function() {
  var blob = null, recorder = null, chunks = [], interval = null, secs = 0, transcript = '';
  var modelsPollingFast = false, modelsTimer = null;

  var dropZone        = document.getElementById('dropZone');
  var fileInput       = document.getElementById('fileInput');
  var dropTitle       = document.getElementById('dropTitle');
  var dropSub         = document.getElementById('dropSub');
  var recBtn          = document.getElementById('recBtn');
  var recTxt          = document.getElementById('recTxt');
  var timer           = document.getElementById('timer');
  var goBtn           = document.getElementById('goBtn');
  var result          = document.getElementById('result');
  var meta            = document.getElementById('meta');
  var copyBtn         = document.getElementById('copyBtn');
  var downloadBtn     = document.getElementById('downloadBtn');
  var modelSel        = document.getElementById('modelSel');
  var langSel         = document.getElementById('langSel');
  var ttlInput        = document.getElementById('ttlInput');
  var streamToggle    = document.getElementById('streamToggle');
  var timestampToggle = document.getElementById('timestampToggle');
  var dot             = document.getElementById('dot');
  var statusTxt       = document.getElementById('statusTxt');
  var errBox          = document.getElementById('errBox');
  var modelDot        = document.getElementById('modelDot');
  var modelStateTxt   = document.getElementById('modelStateTxt');
  var ttlBadge        = document.getElementById('ttlBadge');
  var unloadBtn       = document.getElementById('unloadBtn');
  var wordTimingArea  = document.getElementById('wordTimingArea');
  var wordTimingNote  = document.getElementById('wordTimingNote');
  var wordChips       = document.getElementById('wordChips');
  var mSegmented      = document.getElementById('mSegmented');
  var svcDot          = document.getElementById('svcDot');
  var svcLabel        = document.getElementById('svcLabel');
  var queueBadge      = document.getElementById('queueBadge');
  var modelsList      = document.getElementById('modelsList');
  var langInput        = document.getElementById('langInput');
  var langDrop         = document.getElementById('langDrop');
  var diarizeToggle    = document.getElementById('diarizeToggle');
  var numSpeakersRow   = document.getElementById('numSpeakersRow');
  var numSpeakersInput = document.getElementById('numSpeakersInput');
  var diarizeStateBar  = document.getElementById('diarizeStateBar');
  var diarizeDot       = document.getElementById('diarizeDot');
  var diarizeStateTxt  = document.getElementById('diarizeStateTxt');
  var segmentArea      = document.getElementById('segmentArea');
  var segmentList      = document.getElementById('segmentList');
  var speakerCount     = document.getElementById('speakerCount');
  var SPEAKER_COLORS   = ['#4f46e5','#059669','#d97706','#dc2626','#7c3aed','#0284c7'];
  var speakerColorMap  = {};
  var currentSegments  = null;

  diarizeToggle.addEventListener('change', function() {
    numSpeakersRow.style.display = diarizeToggle.checked ? 'block' : 'none';
  });

  // Full Whisper language list, sorted A-Z
  var LANGS = [
    ['af','Afrikaans'],['sq','Albanian'],['am','Amharic'],['ar','Arabic'],['hy','Armenian'],
    ['as','Assamese'],['az','Azerbaijani'],['ba','Bashkir'],['eu','Basque'],['be','Belarusian'],
    ['bn','Bengali'],['bs','Bosnian'],['br','Breton'],['bg','Bulgarian'],['my','Burmese'],
    ['ca','Catalan'],['zh','Chinese'],['hr','Croatian'],['cs','Czech'],['da','Danish'],
    ['nl','Dutch'],['en','English'],['et','Estonian'],['fo','Faroese'],['fi','Finnish'],
    ['fr','French'],['gl','Galician'],['ka','Georgian'],['de','German'],['el','Greek'],
    ['gu','Gujarati'],['ht','Haitian Creole'],['ha','Hausa'],['haw','Hawaiian'],['he','Hebrew'],
    ['hi','Hindi'],['hu','Hungarian'],['is','Icelandic'],['id','Indonesian'],['it','Italian'],
    ['ja','Japanese'],['jw','Javanese'],['kn','Kannada'],['kk','Kazakh'],['km','Khmer'],
    ['ko','Korean'],['lo','Lao'],['la','Latin'],['lv','Latvian'],['ln','Lingala'],
    ['lt','Lithuanian'],['lb','Luxembourgish'],['mk','Macedonian'],['mg','Malagasy'],['ms','Malay'],
    ['ml','Malayalam'],['mt','Maltese'],['mi','Maori'],['mr','Marathi'],['mn','Mongolian'],
    ['ne','Nepali'],['no','Norwegian'],['nn','Nynorsk'],['oc','Occitan'],['ps','Pashto'],
    ['fa','Persian'],['pl','Polish'],['pt','Portuguese'],['pa','Punjabi'],['ro','Romanian'],
    ['ru','Russian'],['sa','Sanskrit'],['sr','Serbian'],['sn','Shona'],['sd','Sindhi'],
    ['si','Sinhala'],['sk','Slovak'],['sl','Slovenian'],['so','Somali'],['es','Spanish'],
    ['su','Sundanese'],['sw','Swahili'],['sv','Swedish'],['tl','Tagalog'],['tg','Tajik'],
    ['ta','Tamil'],['tt','Tatar'],['te','Telugu'],['th','Thai'],['bo','Tibetan'],
    ['tr','Turkish'],['tk','Turkmen'],['uk','Ukrainian'],['ur','Urdu'],['uz','Uzbek'],
    ['vi','Vietnamese'],['cy','Welsh'],['yi','Yiddish'],['yo','Yoruba']
  ];

  var langActiveIdx = -1;

  function buildLangDrop(filter) {
    while (langDrop.firstChild) langDrop.removeChild(langDrop.firstChild);
    var q = (filter || '').toLowerCase().trim();
    var matches = q ? LANGS.filter(function(l) {
      return l[1].toLowerCase().indexOf(q) !== -1 || l[0].toLowerCase() === q;
    }) : LANGS.slice();
    if (!q) {
      var autoItem = document.createElement('div');
      autoItem.textContent = 'Auto-detect';
      autoItem.addEventListener('mousedown', function(e) {
        e.preventDefault();
        langInput.value = '';
        langSel.value = '';
        hideLangDrop();
      });
      langDrop.appendChild(autoItem);
    }
    matches.forEach(function(l) {
      var item = document.createElement('div');
      item.textContent = l[1] + ' (' + l[0] + ')';
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        langInput.value = l[1];
        langSel.value = l[0];
        hideLangDrop();
      });
      langDrop.appendChild(item);
    });
    langActiveIdx = -1;
  }

  function showLangDrop(filter) {
    buildLangDrop(filter);
    langDrop.style.display = langDrop.children.length ? 'block' : 'none';
  }

  function hideLangDrop() {
    langDrop.style.display = 'none';
    langActiveIdx = -1;
  }

  langInput.addEventListener('focus', function() { showLangDrop(langInput.value); });

  langInput.addEventListener('input', function() {
    langSel.value = '';
    showLangDrop(langInput.value);
  });

  langInput.addEventListener('blur', function() {
    setTimeout(function() {
      hideLangDrop();
      if (!langSel.value) langInput.value = '';
    }, 160);
  });

  langInput.addEventListener('keydown', function(e) {
    var items = langDrop.querySelectorAll('div');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      langActiveIdx = Math.min(langActiveIdx + 1, items.length - 1);
      items.forEach(function(el, i) { el.classList.toggle('active', i === langActiveIdx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      langActiveIdx = Math.max(langActiveIdx - 1, 0);
      items.forEach(function(el, i) { el.classList.toggle('active', i === langActiveIdx); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (langActiveIdx >= 0 && items[langActiveIdx]) {
        items[langActiveIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      hideLangDrop();
      langInput.blur();
    }
  });

  function fmt(s) { var m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  function fmtTs(s) { return s == null ? '?' : s.toFixed(2) + 's'; }

  function showErr(msg) { errBox.textContent = msg; errBox.style.display = 'block'; }
  function clearErr() { errBox.style.display = 'none'; }

  function setReady(b, name, size) {
    blob = b;
    dropZone.className = 'drop-zone ready';
    dropTitle.textContent = name;
    dropSub.textContent = (size / 1024).toFixed(0) + ' KB';
    goBtn.disabled = false;
  }

  function ttlLabel(ttl) {
    if (ttl === -1) return { text: 'persistent', cls: 'badge persistent' };
    if (ttl === 0)  return { text: 'ephemeral',  cls: 'badge ephemeral' };
    return { text: 'keep-warm ' + ttl + 's', cls: 'badge warm' };
  }

  // --- Health polling ---

  function updateHealth(d) {
    dot.className = 'dot ok';
    statusTxt.textContent = 'Online \\u00B7 v' + d.version;
    var loaded = d.loaded_model;
    if (loaded) {
      modelDot.className = 'dot ok';
      modelStateTxt.textContent = 'In memory: ' + loaded;
      unloadBtn.style.display = 'inline-block';
    } else {
      modelDot.className = 'dot';
      modelStateTxt.textContent = 'No model in memory';
      unloadBtn.style.display = 'none';
    }
    var ttl = d.config && typeof d.config.model_ttl === 'number' ? d.config.model_ttl : 0;
    var lbl = ttlLabel(ttl);
    ttlBadge.textContent = lbl.text;
    ttlBadge.className = lbl.cls;
    ttlBadge.style.display = 'inline-block';
    var dz = d.diarization;
    if (dz) {
      diarizeStateBar.style.display = 'flex';
      var dzStatus = dz.status || 'not_setup';
      if (dzStatus === 'ready') {
        diarizeDot.className = 'dot ok';
        diarizeStateTxt.textContent = 'Diarisation ready';
      } else if (dzStatus === 'starting') {
        diarizeDot.className = 'dot';
        diarizeStateTxt.textContent = 'Diarisation starting\\u2026';
      } else if (dzStatus === 'not_setup') {
        diarizeDot.className = 'dot';
        diarizeStateTxt.textContent = 'Diarisation: run \\u2018transcribe diarize-setup\\u2019 to enable';
      } else if (dzStatus === 'token_missing') {
        diarizeDot.className = 'dot err';
        diarizeStateTxt.textContent = 'Diarisation: HuggingFace token missing \\u2014 run diarize-setup';
      } else if (dzStatus === 'python_missing') {
        diarizeDot.className = 'dot err';
        diarizeStateTxt.textContent = 'Diarisation: Python not found';
      } else if (dzStatus === 'error') {
        diarizeDot.className = 'dot err';
        diarizeStateTxt.textContent = 'Diarisation: sidecar error \\u2014 try restarting';
      } else {
        diarizeDot.className = 'dot';
        diarizeStateTxt.textContent = 'Diarisation: ' + dzStatus;
      }
    }
  }

  function pollHealth() {
    fetch('/health').then(function(r) { return r.json(); }).then(function(d) {
      updateHealth(d);
    }).catch(function() {
      dot.className = 'dot err';
      statusTxt.textContent = 'Service offline';
      modelDot.className = 'dot err';
      modelStateTxt.textContent = 'Service unreachable';
      unloadBtn.style.display = 'none';
      ttlBadge.style.display = 'none';
    });
  }

  fetch('/health').then(function(r) { return r.json(); }).then(function(d) {
    updateHealth(d);
  }).catch(function() {
    dot.className = 'dot err';
    statusTxt.textContent = 'Service offline';
    modelDot.className = 'dot err';
    modelStateTxt.textContent = 'Service unreachable';
    showErr('Cannot reach the transcription service. Make sure \\u201Ctranscribe start\\u201D is running and refresh this page.');
  });
  setInterval(pollHealth, 5000);

  // --- Service status polling ---

  function fetchSvcStatus() {
    fetch('/status').then(function(r) { return r.json(); }).then(function(d) {
      var st = d.status || 'idle';
      var label = 'Idle';
      var active = false;
      if (st === 'transcribing') { label = 'Transcribing'; active = true; }
      else if (st === 'loading') { label = 'Loading model'; active = true; }
      else if (st === 'queued') { label = 'Queued'; active = true; }
      else if (st === 'downloading') {
        var short = d.model ? d.model.split('/').pop() : '';
        var pct = d.progress != null ? ' ' + Math.round(d.progress) + '%' : '';
        label = 'Downloading' + (short ? ' ' + short : '') + pct;
        active = true;
        // Reflect progress in the models panel row
        if (short) {
          var row = document.querySelector('[data-model="' + short + '"]');
          if (row) {
            var statusEl = row.querySelector('.model-row-status');
            if (statusEl && d.progress != null) {
              var b = statusEl.querySelector('span');
              if (b) b.textContent = 'Downloading ' + Math.round(d.progress) + '%';
            }
          }
        }
      }
      svcDot.className = active ? 'svc-dot active' : 'svc-dot';
      svcLabel.textContent = label;
      var q = d.queue_depth || 0;
      if (q > 0) {
        queueBadge.textContent = q + (q === 1 ? ' request queued' : ' requests queued');
        queueBadge.style.display = 'inline-block';
      } else {
        queueBadge.style.display = 'none';
      }
    }).catch(function() {});
  }

  fetchSvcStatus();
  setInterval(fetchSvcStatus, 3000);

  // --- Models panel ---

  function renderModels(data) {
    // Update selector
    var currentSel = modelSel.value;
    modelSel.innerHTML = '';
    data.models.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.name;
      var lbl = m.name + ' (' + m.size_mb + ' MB)';
      if (m.downloading) lbl += ' \\u2014 downloading\\u2026';
      else if (m.downloaded) lbl += ' \\u2713';
      opt.textContent = lbl;
      if (m.name === data.default) opt.selected = true;
      modelSel.appendChild(opt);
    });
    if (currentSel) { modelSel.value = currentSel; }

    // Render list
    modelsList.innerHTML = '';
    data.models.forEach(function(m) {
      var row = document.createElement('div');
      row.className = 'model-row';
      row.setAttribute('data-model', m.name);

      var nameEl = document.createElement('span');
      nameEl.className = 'model-row-name';
      nameEl.textContent = m.name;

      var sizeEl = document.createElement('span');
      sizeEl.className = 'model-row-size';
      sizeEl.textContent = m.size_mb + ' MB';

      var statusEl = document.createElement('span');
      statusEl.className = 'model-row-status';

      var actionEl = document.createElement('span');
      actionEl.className = 'model-row-action';

      if (m.loaded) {
        var b = document.createElement('span');
        b.className = 'badge badge-loaded';
        b.textContent = 'Loaded';
        statusEl.appendChild(b);
      } else if (m.downloading) {
        var b = document.createElement('span');
        b.className = 'badge badge-downloading';
        b.textContent = 'Downloading\\u2026';
        statusEl.appendChild(b);
      } else if (m.downloaded) {
        var b = document.createElement('span');
        b.className = 'badge badge-dl';
        b.textContent = 'Downloaded';
        statusEl.appendChild(b);
      } else {
        var dlBtn = document.createElement('button');
        dlBtn.className = 'btn-dl';
        dlBtn.textContent = 'Download';
        (function(name) {
          dlBtn.addEventListener('click', function() { pullModel(name); });
        }(m.name));
        actionEl.appendChild(dlBtn);
      }

      row.appendChild(nameEl);
      row.appendChild(sizeEl);
      row.appendChild(statusEl);
      row.appendChild(actionEl);
      modelsList.appendChild(row);
    });

    // Speed up polling while any model is downloading
    var anyDl = data.models.some(function(m) { return m.downloading; });
    if (anyDl && !modelsPollingFast) {
      modelsPollingFast = true;
      clearInterval(modelsTimer);
      modelsTimer = setInterval(fetchModels, 2000);
    } else if (!anyDl && modelsPollingFast) {
      modelsPollingFast = false;
      clearInterval(modelsTimer);
      modelsTimer = setInterval(fetchModels, 8000);
    }
  }

  function fetchModels() {
    return fetch('/models').then(function(r) { return r.json(); }).then(function(d) {
      renderModels(d);
    }).catch(function() {});
  }

  function pullModel(name) {
    // Optimistically update the row to prevent double-clicks
    var row = document.querySelector('[data-model="' + name + '"]');
    if (row) {
      var statusEl = row.querySelector('.model-row-status');
      var actionEl = row.querySelector('.model-row-action');
      if (statusEl) {
        var b = document.createElement('span');
        b.className = 'badge badge-downloading';
        b.textContent = 'Starting\\u2026';
        statusEl.innerHTML = '';
        statusEl.appendChild(b);
      }
      if (actionEl) { actionEl.innerHTML = ''; }
    }
    fetch('/models/' + encodeURIComponent(name) + '/pull', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function() { fetchModels(); })
      .catch(function(e) { showErr('Download failed: ' + e.message); fetchModels(); });
  }

  fetchModels();
  modelsTimer = setInterval(fetchModels, 8000);

  // --- Unload ---

  unloadBtn.addEventListener('click', function() {
    unloadBtn.disabled = true;
    unloadBtn.textContent = 'Unloading\\u2026';
    fetch('/models/unload', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.status === 'unloaded' || d.status === 'not_loaded') {
        modelDot.className = 'dot';
        modelStateTxt.textContent = 'No model in memory';
        unloadBtn.style.display = 'none';
        fetchModels();
      }
    }).catch(function(e) {
      showErr('Unload failed: ' + e.message);
    }).finally(function() {
      unloadBtn.disabled = false;
      unloadBtn.textContent = 'Unload';
    });
  });

  // --- Audio input ---

  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('over'); });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('over');
    var f = e.dataTransfer.files[0];
    if (f) { stopRec(); setReady(f, f.name, f.size); }
  });
  fileInput.addEventListener('change', function() {
    var f = fileInput.files[0];
    if (f) { stopRec(); setReady(f, f.name, f.size); }
  });

  recBtn.addEventListener('click', function() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      chunks = []; secs = 0;
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = function() {
        var b = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(function(t) { t.stop(); });
        clearInterval(interval);
        recBtn.className = 'btn btn-record';
        recTxt.textContent = 'Record Again';
        timer.textContent = '';
        setReady(b, 'Recording (' + fmt(secs) + ')', b.size);
      };
      recorder.start(200);
      dropZone.className = 'drop-zone';
      dropTitle.textContent = 'Recording\\u2026';
      dropSub.textContent = '';
      blob = null; goBtn.disabled = true;
      recBtn.className = 'btn btn-record active';
      recTxt.textContent = 'Stop Recording';
      interval = setInterval(function() { secs++; timer.textContent = fmt(secs); }, 1000);
    }).catch(function() {
      showErr('Microphone access denied. Please allow microphone access in your browser and try again.');
    });
  });

  function stopRec() {
    if (recorder && recorder.state === 'recording') { recorder.stop(); }
    clearInterval(interval);
    recBtn.className = 'btn btn-record';
    recTxt.textContent = 'Start Recording';
    timer.textContent = '';
    secs = 0;
  }

  // --- Transcription ---

  function setStatus(msg) {
    result.className = 'result-area';
    result.innerHTML = '<div class=\\"loading\\"><div class=\\"spin\\"></div> ' + msg + '</div>';
  }

  function renderWords(words, note) {
    wordChips.innerHTML = '';
    words.forEach(function(w) {
      var chip = document.createElement('span');
      chip.className = 'word-chip';
      var wordSpan = document.createElement('span');
      wordSpan.className = 'chip-word';
      wordSpan.textContent = w.word.trim() || '\\u00B7';
      var tsSpan = document.createElement('span');
      tsSpan.className = 'chip-ts';
      tsSpan.textContent = fmtTs(w.start) + '\\u2013' + fmtTs(w.end);
      chip.appendChild(wordSpan);
      chip.appendChild(tsSpan);
      wordChips.appendChild(chip);
    });
    wordTimingNote.textContent = note || '';
    wordTimingNote.style.display = note ? 'block' : 'none';
    wordTimingArea.style.display = 'block';
  }

  function speakerColor(speaker) {
    if (!speakerColorMap[speaker]) {
      var idx = Object.keys(speakerColorMap).length % SPEAKER_COLORS.length;
      speakerColorMap[speaker] = SPEAKER_COLORS[idx];
    }
    return speakerColorMap[speaker];
  }

  function renderSegments(segments, detected) {
    segmentList.innerHTML = '';
    speakerCount.textContent = detected + ' speaker' + (detected !== 1 ? 's' : '') + ' detected';
    segments.forEach(function(seg) {
      var div = document.createElement('div');
      div.className = 'segment';

      var header = document.createElement('div');
      header.className = 'segment-header';

      var badge = document.createElement('span');
      badge.className = 'segment-speaker';
      badge.style.background = speakerColor(seg.speaker);
      badge.textContent = seg.speaker.replace('_', '\\u00A0');

      var time = document.createElement('span');
      time.className = 'segment-time';
      time.textContent = fmtTs(seg.start) + '\\u2013' + fmtTs(seg.end);

      header.appendChild(badge);
      header.appendChild(time);

      var text = document.createElement('div');
      text.className = 'segment-text';
      text.textContent = seg.text;

      div.appendChild(header);
      div.appendChild(text);
      segmentList.appendChild(div);
    });
    segmentArea.style.display = 'block';
  }

  function handleComplete(ev, model, lang) {
    if (ev.segments && ev.segments.length > 0) {
      currentSegments = ev.segments;
      transcript = ev.segments.map(function(s) { return s.speaker + ': ' + s.text; }).join('\\n');
      result.className = 'result-area empty';
      result.textContent = '';
      renderSegments(ev.segments, ev.speakers_detected || ev.segments.length);
      wordTimingArea.style.display = 'none';
    } else {
      currentSegments = null;
      transcript = ev.transcript || '';
      result.className = 'result-area' + (transcript ? '' : ' empty');
      result.textContent = transcript || '(empty transcript)';
      segmentArea.style.display = 'none';
      if (ev.words && ev.words.length > 0) {
        renderWords(ev.words, ev.timestamp_note || null);
      } else {
        wordTimingArea.style.display = 'none';
      }
    }
    document.getElementById('mDur').textContent  = (ev.duration_ms / 1000).toFixed(1) + 's';
    document.getElementById('mMod').textContent  = ev.model_used || model;
    document.getElementById('mLang').textContent = ev.language || lang || 'auto';
    mSegmented.style.display = ev.segmented ? 'inline' : 'none';
    meta.style.display = 'flex';
    copyBtn.style.display = 'inline-block';
    downloadBtn.style.display = 'inline-block';
    goBtn.disabled = false;
    pollHealth();
    fetchModels();
  }

  function handleError(msg) {
    showErr(msg || 'Transcription failed.');
    result.className = 'result-area empty';
    result.textContent = 'Transcription failed.';
    wordTimingArea.style.display = 'none';
    goBtn.disabled = false;
    pollHealth();
  }

  goBtn.addEventListener('click', function() {
    if (!blob) return;
    clearErr();
    var model = modelSel.value;
    var lang  = langSel.value;
    var wantsStream = streamToggle.checked;
    var wantsTimestamps = timestampToggle.checked;
    var wantsDiarize = diarizeToggle.checked;
    var numSpk = numSpeakersInput.value.trim();
    var ttlVal = ttlInput.value.trim();

    var params = new URLSearchParams();
    if (model) params.set('model', model);
    if (lang && lang !== 'auto') params.set('language', lang);
    if (wantsDiarize) {
      params.set('diarize', 'true');
      if (numSpk) params.set('num_speakers', numSpk);
    } else if (wantsTimestamps) {
      params.set('timestamps', 'word');
    }
    if (ttlVal !== '') params.set('model_ttl', ttlVal);
    if (wantsStream) params.set('stream', 'true');

    var url = '/transcribe?' + params.toString();
    var fd = new FormData();
    fd.append('file', blob, blob.name || 'recording.webm');
    goBtn.disabled = true;
    wordTimingArea.style.display = 'none';
    segmentArea.style.display = 'none';
    speakerColorMap = {};
    currentSegments = null;
    meta.style.display = 'none';
    copyBtn.style.display = 'none';
    downloadBtn.style.display = 'none';
    setStatus('Starting\\u2026');

    if (!wantsStream) {
      fetch(url, { method: 'POST', body: fd }).then(function(r) {
        return r.json().then(function(d) {
          if (!r.ok) throw new Error(d.error || 'Request failed');
          return d;
        });
      }).then(function(d) {
        handleComplete(d, model, lang);
      }).catch(function(e) {
        handleError('Request failed: ' + e.message);
      });
      return;
    }

    fetch(url, { method: 'POST', body: fd }).then(function(r) {
      if (!r.ok) {
        return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
      }
      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      function read() {
        return reader.read().then(function(chunk) {
          if (chunk.done) return;
          buf += decoder.decode(chunk.value, { stream: true });
          var lines = buf.split('\\n');
          buf = lines.pop();
          lines.forEach(function(line) {
            if (!line.startsWith('data: ')) return;
            var ev;
            try { ev = JSON.parse(line.slice(6)); } catch (e) { return; }
            if (ev.status === 'queued') {
              setStatus('Queued \\u2014 waiting for current request to finish\\u2026');
            } else if (ev.status === 'downloading') {
              setStatus('Downloading model' + (ev.model ? ' (' + ev.model.split('/').pop() + ')' : '') + '\\u2026 ' + (ev.progress || 0) + '%');
            } else if (ev.status === 'loading') {
              setStatus('Loading model into memory\\u2026');
            } else if (ev.status === 'transcribing') {
              if (ev.partial) { result.className = 'result-area'; result.textContent = ev.partial; }
              else { setStatus('Transcribing\\u2026'); }
            } else if (ev.status === 'complete') {
              handleComplete(ev, model, lang);
            } else if (ev.status === 'error') {
              handleError(ev.error);
            }
          });
          return read();
        });
      }
      return read();
    }).catch(function(e) {
      handleError('Request failed: ' + e.message);
    });
  });

  copyBtn.addEventListener('click', function() {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript).then(function() {
      copyBtn.textContent = 'Copied!';
      setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  downloadBtn.addEventListener('click', function() {
    if (!transcript) return;
    var dlBlob = new Blob([transcript], { type: 'text/plain' });
    var url = URL.createObjectURL(dlBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
</script>
</body>
</html>`;
