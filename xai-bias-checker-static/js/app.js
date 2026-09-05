(() => {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const fileNameEl = document.getElementById("fileName");
  const errorBox = document.getElementById("errorBox");

  const weightsPanel = document.getElementById("weightsPanel");
  const wIntercept = document.getElementById("wIntercept");
  const wPrior = document.getElementById("wPrior");
  const wRace = document.getElementById("wRace");
  const weightsNote = document.getElementById("weightsNote");

  const summarySection = document.getElementById("summary");
  const sumTotal = document.getElementById("sumTotal");
  const sumFlipped = document.getElementById("sumFlipped");
  const sumRate = document.getElementById("sumRate");

  const ledger = document.getElementById("ledger");
  const emptyState = document.getElementById("emptyState");
  const caseTemplate = document.getElementById("caseTemplate");

  const singleSub = document.getElementById("singleSub");
  const singleForm = document.getElementById("singleForm");
  const singleId = document.getElementById("singleId");
  const singleSubmitBtn = document.getElementById("singleSubmitBtn");
  const singleError = document.getElementById("singleError");
  const singleResult = document.getElementById("singleResult");

  const REQUIRED_COLUMNS = ["suspect_id", "race", "prior_record", "reoffended"];
  const MAX_ROWS = 2000;

  let selectedFile = null;
  let learnedWeights = null; // 1단계에서 학습되면 채워짐

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
  // 1단계: 학습 데이터 업로드 → 가중치 학습 + 각 기록 대조
  // -------------------------------------------------------------
  analyzeBtn.addEventListener("click", () => {
    if (!selectedFile) return;
    hideError();
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "학습 중…";

    const reader = new FileReader();
    reader.onload = () => {
      try {
        runTraining(reader.result);
      } catch (err) {
        showError("CSV를 처리하는 중 오류가 발생했습니다. 형식을 확인해주세요.");
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "가중치 학습 + 분석";
      }
    };
    reader.onerror = () => {
      showError("파일을 읽을 수 없습니다.");
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "가중치 학습 + 분석";
    };
    reader.readAsText(selectedFile, "utf-8");
  });

  function runTraining(text) {
    const { headers, rows } = parseCSV(text);
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) {
      showError(
        `필수 컬럼이 누락되었습니다: ${missing.join(", ")}. 필요한 컬럼: ${REQUIRED_COLUMNS.join(", ")}`
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
    const validRows = [];
    rows.forEach((row) => {
      const race = (row.race || "").trim();
      const priorRecord = (row.prior_record || "").trim();
      const reoffended = (row.reoffended || "").trim();
      if (
        !["백인", "흑인"].includes(race) ||
        !["무전과", "전과있음"].includes(priorRecord) ||
        !["예", "아니오"].includes(reoffended)
      ) {
        skipped++;
        return;
      }
      validRows.push({
        suspect_id: (row.suspect_id || "").trim() || `ROW_${validRows.length + 1}`,
        race,
        prior_record: priorRecord,
        reoffended,
      });
    });

    if (validRows.length === 0) {
      showError("형식이 맞는 학습 데이터가 없습니다. 컬럼 값(백인/흑인, 무전과/전과있음, 예/아니오)을 확인해주세요.");
      return;
    }

    // 가중치 학습
    learnedWeights = learnWeights(validRows);
    renderWeightsPanel(learnedWeights);
    unlockSingleForm();

    // 학습에 쓰인 각 기록에 대해서도 두 모델의 판단을 계산해서 보여준다 (감사용)
    const results = validRows.map((r) =>
      Object.assign(analyzeRow(r.suspect_id, r.race, r.prior_record, learnedWeights), {
        actual: r.reoffended,
      })
    );

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

  function renderWeightsPanel(w) {
    wIntercept.textContent = w.intercept.toFixed(2);
    wPrior.textContent = (w.wPrior >= 0 ? "+" : "") + w.wPrior.toFixed(2);
    wRace.textContent = (w.wRace >= 0 ? "+" : "") + w.wRace.toFixed(2);

    const raceMagnitude = Math.abs(w.wRace);
    if (raceMagnitude < 0.03) {
      weightsNote.textContent = `표본 ${w.n}건 기준, 이 데이터에서는 인종 가중치가 거의 0으로 학습되었습니다.`;
    } else {
      weightsNote.textContent = `표본 ${w.n}건 기준, 이 데이터에서는 인종 가중치가 ${w.wRace.toFixed(2)}로 학습되었습니다 (0에서 멀수록 결과에 영향이 큽니다).`;
    }
    weightsPanel.hidden = false;
  }

  function unlockSingleForm() {
    singleSub.textContent =
      "방금 학습된 가중치를 그대로 사용합니다. 인종과 전과 이력을 골라 판단해보세요.";
    document.querySelectorAll(".chip").forEach((chip) => (chip.disabled = false));
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
  // 2단계: 신규 인물 단건 판단 (칩 선택 + 폼 제출)
  // -------------------------------------------------------------
  const singleValues = { race: null, prior_record: null };

  document.querySelectorAll(".chip-group").forEach((group) => {
    const name = group.dataset.name;
    group.querySelectorAll(".chip").forEach((chip) => {
      chip.disabled = true; // 학습 전에는 비활성화
      chip.addEventListener("click", () => {
        group.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        singleValues[name] = chip.dataset.value;
        singleSubmitBtn.disabled = !(singleValues.race && singleValues.prior_record);
        singleError.hidden = true;
      });
    });
  });

  singleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!learnedWeights) {
      singleError.textContent = "먼저 위에서 학습 데이터를 업로드해 가중치를 학습시켜주세요.";
      singleError.hidden = false;
      return;
    }
    if (!singleValues.race || !singleValues.prior_record) {
      singleError.textContent = "인종과 전과 이력을 모두 선택해주세요.";
      singleError.hidden = false;
      return;
    }
    const id = singleId.value.trim() || "신규 인물";
    const result = analyzeRow(id, singleValues.race, singleValues.prior_record, learnedWeights);

    singleResult.innerHTML = "";
    singleResult.appendChild(buildCaseCard(result));
  });

  // -------------------------------------------------------------
  // 결과 렌더링
  // -------------------------------------------------------------
  function renderResults(data) {
    ledger.innerHTML = "";

    if (!data.total) {
      emptyState.hidden = false;
      summarySection.hidden = true;
      return;
    }

    emptyState.hidden = true;
    summarySection.hidden = false;
    sumTotal.textContent = data.total;
    sumFlipped.textContent = data.flipped_count;

    const pct = Math.round((data.flipped_rate || 0) * 100);
    let rateNote = `전체의 ${pct}%가 인종 가중치 때문에 판단이 뒤집혔습니다.`;
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

    const actualTag = node.querySelector(".tag-actual");
    if (row.actual) {
      actualTag.textContent = `실제 재범: ${row.actual}`;
      actualTag.hidden = false;
    }

    const flag = node.querySelector(".case-flag");
    if (row.is_flipped) flag.hidden = false;

    fillVerdict(
      node.querySelector(".verdict-biased"),
      row.biased_result,
      row.biased_score,
      row.biased_formula,
      row.biased_flagged
    );
    fillVerdict(
      node.querySelector(".verdict-fair"),
      row.fair_result,
      row.fair_score,
      row.fair_formula,
      row.fair_flagged
    );

    return node;
  }

  function fillVerdict(el, resultText, score, formula, flagged) {
    const resultEl = el.querySelector(".verdict-result");
    resultEl.textContent = resultText;
    resultEl.classList.add(flagged ? "flagged" : "cleared");
    el.querySelector(".verdict-score").textContent = `산출 점수: ${score.toFixed(2)} / 기준치 0.50`;
    el.querySelector(".verdict-reason").textContent = formula;
  }
})();
