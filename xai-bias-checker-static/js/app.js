(() => {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const fileNameEl = document.getElementById("fileName");
  const errorBox = document.getElementById("errorBox");

  const summarySection = document.getElementById("summary");
  const sumTotal = document.getElementById("sumTotal");
  const sumFlipped = document.getElementById("sumFlipped");
  const sumRate = document.getElementById("sumRate");

  const ledger = document.getElementById("ledger");
  const emptyState = document.getElementById("emptyState");
  const caseTemplate = document.getElementById("caseTemplate");

  const REQUIRED_COLUMNS = ["suspect_id", "race", "prior_record"];
  const MAX_ROWS = 2000;

  let selectedFile = null;

  // -------------------------------------------------------------
  // 파일 선택 / 드래그앤드롭
  // -------------------------------------------------------------
  browseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) setSelectedFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });

  function setSelectedFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showError("CSV 파일만 업로드할 수 있습니다.");
      return;
    }
    hideError();
    selectedFile = file;
    fileNameEl.textContent = `선택된 파일: ${file.name}`;
    analyzeBtn.disabled = false;
  }

  // -------------------------------------------------------------
  // CSV 파싱 (따옴표로 감싼 필드도 처리하는 간단한 파서)
  // -------------------------------------------------------------
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, ""); // BOM 제거
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line) => {
      const cells = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const cells = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cells[i] !== undefined ? cells[i] : ""));
      return obj;
    });
    return { headers, rows };
  }

  // -------------------------------------------------------------
  // 분석 실행 (전부 브라우저 안에서 처리, 서버 전송 없음)
  // -------------------------------------------------------------
  analyzeBtn.addEventListener("click", () => {
    if (!selectedFile) return;
    hideError();
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "분석 중…";

    const reader = new FileReader();
    reader.onload = () => {
      try {
        runAnalysis(reader.result);
      } catch (err) {
        showError("CSV를 처리하는 중 오류가 발생했습니다. 형식을 확인해주세요.");
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "분석 실행";
      }
    };
    reader.onerror = () => {
      showError("파일을 읽을 수 없습니다.");
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "분석 실행";
    };
    reader.readAsText(selectedFile, "utf-8");
  });

  function runAnalysis(text) {
    const { headers, rows } = parseCSV(text);
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) {
      showError(
        `필수 컬럼이 누락되었습니다: ${missing.join(", ")}. 필요한 컬럼: suspect_id, race, prior_record`
      );
      return;
    }
    if (rows.length === 0) {
      showError("CSV에 데이터 행이 없습니다.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      showError(`최대 ${MAX_ROWS}행까지 처리할 수 있습니다.`);
      return;
    }

    let skipped = 0;
    const results = [];
    rows.forEach((row, i) => {
      const suspectId = (row.suspect_id || `ROW_${i + 1}`).trim();
      const race = (row.race || "").trim();
      const priorRecord = (row.prior_record || "").trim();

      if (!["백인", "흑인"].includes(race) || !["무전과", "전과있음"].includes(priorRecord)) {
        skipped++;
        return;
      }
      results.push(analyzeRow(suspectId, race, priorRecord));
    });

    const total = results.length;
    const flipped = results.filter((r) => r.is_flipped).length;

    renderResults({
      total,
      skipped,
      flipped_count: flipped,
      flipped_rate: total ? flipped / total : 0,
      results,
    });
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  // -------------------------------------------------------------
  // 결과 렌더링
  // -------------------------------------------------------------
  function renderResults(data) {
    ledger.innerHTML = "";

    if (!data.total) {
      emptyState.hidden = false;
      summarySection.hidden = true;
      if (!data.skipped) showError("분석할 수 있는 유효한 행이 없습니다.");
      else showError(`형식이 맞지 않아 ${data.skipped}건을 모두 건너뛰었습니다.`);
      return;
    }

    emptyState.hidden = true;
    summarySection.hidden = false;
    sumTotal.textContent = data.total;
    sumFlipped.textContent = data.flipped_count;

    const pct = Math.round((data.flipped_rate || 0) * 100);
    let rateNote = `전체의 ${pct}%가 인종 요소만으로 판단이 뒤집혔습니다.`;
    if (data.skipped) {
      rateNote += ` (형식이 맞지 않아 건너뛴 행 ${data.skipped}건)`;
    }
    sumRate.textContent = rateNote;

    data.results.forEach((row) => ledger.appendChild(buildCaseCard(row)));
  }

  function buildCaseCard(row) {
    const node = caseTemplate.content.cloneNode(true);

    node.querySelector(".case-id").textContent = row.suspect_id;
    node.querySelector(".tag-race").textContent = row.race;
    node.querySelector(".tag-record").textContent = row.prior_record;

    const flag = node.querySelector(".case-flag");
    if (row.is_flipped) flag.hidden = false;

    fillVerdict(
      node.querySelector(".verdict-biased"),
      row.biased_result,
      row.biased_score,
      row.biased_xai_reason,
      row.biased_flagged
    );
    fillVerdict(
      node.querySelector(".verdict-fair"),
      row.fair_result,
      row.fair_score,
      row.fair_xai_reason,
      row.fair_flagged
    );

    return node;
  }

  function fillVerdict(el, resultText, score, reason, flagged) {
    const resultEl = el.querySelector(".verdict-result");
    resultEl.textContent = resultText;
    resultEl.classList.add(flagged ? "flagged" : "cleared");
    el.querySelector(".verdict-score").textContent = `산출 점수: ${score.toFixed(2)}`;
    el.querySelector(".verdict-reason").textContent = reason;
  }
})();
