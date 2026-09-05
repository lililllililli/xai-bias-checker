/**
 * model.js
 *
 * 모델은 하나뿐이다. "편향 모델"과 "공정 모델"을 따로 두지 않는다 —
 * 인종 항목을 빼는 것 자체가 사람이 미리 정해둔 규칙이기 때문이다.
 *
 * 이 모델의 가중치(기준값 / 전과 가중치 / 인종 가중치)는 전부 업로드한
 * 학습 데이터에서 계산된다. 코드 어디에도 미리 설정된 가중치 숫자는 없다.
 *
 * 학습 방법 (그룹별 실제 재범 비율 차이):
 *   1) 기준값(intercept)  = 학습 데이터 중 [백인 · 무전과] 그룹의 실제 재범 비율
 *   2) 전과 가중치(wPrior) = [백인 · 전과있음] 그룹의 재범 비율 - 기준값
 *   3) 인종 가중치(wRace)  = [흑인 · 무전과]   그룹의 재범 비율 - 기준값
 *
 * 이 모델을 편향된 과거 데이터로 학습시키면 인종 가중치가 크게 학습되고,
 * 인종과 무관하게 설계된 데이터로 학습시키면 인종 가중치가 0에 가깝게
 * 학습된다. 판단이 편향적인지 공정한지는 모델 설계가 아니라 "무엇을
 * 학습시켰는지"에서만 갈린다.
 *
 * 주의: 실제 수사 도구가 아니라 알고리즘 편향이 데이터로부터 어떻게
 * 학습되는지를 보여주기 위한 합성 데이터 기반 교육용 시연 모델이다.
 */

const THRESHOLD = 0.5; // 학습값이 0~1 사이 비율이므로 50%를 기준으로 삼는다.
const FLAGGED_LABEL = "유력 용의자 특정";
const CLEARED_LABEL = "용의선상 제외";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fmt(n) {
  return n.toFixed(2);
}

/** race/prior_record 조합에 해당하는 그룹의 재범('예') 비율을 계산한다. */
function groupReoffendRate(rows, race, priorRecord) {
  const subset = rows.filter((r) => r.race === race && r.prior_record === priorRecord);
  if (subset.length === 0) return null;
  const positive = subset.filter((r) => r.reoffended === "예").length;
  return { rate: positive / subset.length, n: subset.length };
}

/**
 * 학습 데이터(각 행에 race, prior_record, reoffended가 있는 배열)로부터
 * 가중치를 계산한다. 미리 정해진 초기값은 전혀 없다 — 계산 결과 자체가
 * 곧 학습된 가중치다. 특정 그룹의 표본이 하나도 없으면 전체 평균으로
 * 대체한다 (표본 부족 시 극단값이 나오는 것을 막기 위함).
 */
function learnWeights(rows) {
  const overallPositive = rows.filter((r) => r.reoffended === "예").length;
  const overallRate = rows.length ? overallPositive / rows.length : 0;

  const g00 = groupReoffendRate(rows, "백인", "무전과"); // 기준 그룹
  const g10 = groupReoffendRate(rows, "백인", "전과있음"); // 전과 효과 관측 그룹
  const g01 = groupReoffendRate(rows, "흑인", "무전과"); // 인종 효과 관측 그룹

  const intercept = g00 ? g00.rate : overallRate;
  const priorRate = g10 ? g10.rate : overallRate;
  const raceRate = g01 ? g01.rate : overallRate;

  return {
    intercept: round2(intercept),
    wPrior: round2(priorRate - intercept),
    wRace: round2(raceRate - intercept),
    n: rows.length,
  };
}

/** 학습된 가중치(w)만으로 점수를 계산한다. 하드코딩된 상수는 전혀 쓰이지 않는다. */
function score(race, priorRecord, w) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  const b = race === "흑인" ? 1 : 0;
  return w.intercept + p * w.wPrior + b * w.wRace;
}

function formula(race, priorRecord, w, s, flagged) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  const b = race === "흑인" ? 1 : 0;
  const verdict = flagged
    ? `≥ ${fmt(THRESHOLD)} → ${FLAGGED_LABEL}`
    : `< ${fmt(THRESHOLD)} → ${CLEARED_LABEL}`;
  return (
    `${fmt(w.intercept)} + (전과있음:${p} × ${fmt(w.wPrior)}) + (흑인:${b} × ${fmt(w.wRace)}) ` +
    `= ${fmt(s)}  ${verdict}`
  );
}

/** 한 사람에 대해, 학습된 가중치(w) 하나만 사용해 판단 결과를 반환한다. */
function analyzeRow(suspectId, race, priorRecord, w) {
  const s = score(race, priorRecord, w);
  const flagged = s >= THRESHOLD;

  return {
    suspect_id: suspectId,
    race,
    prior_record: priorRecord,
    score: round2(s),
    result: flagged ? FLAGGED_LABEL : CLEARED_LABEL,
    flagged,
    formula: formula(race, priorRecord, w, s, flagged),
  };
}
