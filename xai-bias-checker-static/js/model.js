/**
 * model.js
 *
 * 이전 버전과의 핵심 차이: 가중치(전과 가중치 / 인종 가중치)는 더 이상
 * 개발자가 미리 정해둔 상수가 아니다. 업로드된 학습 데이터(과거 기록 +
 * 실제 재범 여부)를 바탕으로 그 자리에서 계산된다.
 *
 * 학습 방법 (단순 그룹별 비율 차이 — "가법 모델"):
 *   1) 기준값(intercept)  = 학습 데이터 중 [백인 · 무전과] 그룹의 실제 재범 비율
 *   2) 전과 가중치(wPrior) = [백인 · 전과있음] 그룹의 재범 비율 - 기준값
 *   3) 인종 가중치(wRace)  = [흑인 · 무전과]   그룹의 재범 비율 - 기준값
 *
 * '편향 모델'은 세 값을 모두 더해 점수를 만들고, '공정 모델'은 인종 가중치
 * 항목을 아예 제외하고 점수를 만든다. 즉 두 모델이 같은 데이터에서 같은
 * 방식으로 학습되지만, 공정 모델은 인종 정보 자체를 입력받지 않는다.
 *
 * 데이터 자체에 인종별로 재범 비율 차이가 없다면 wRace는 0에 가깝게
 * 학습되고, 두 모델의 결과는 사실상 같아진다. 반대로 과거 기록에 인종에
 * 따른 격차가 이미 들어있다면, 그 격차가 그대로 wRace 값으로 학습되어
 * 편향 모델의 판단에 반영된다.
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
 * 가중치를 계산한다. 특정 그룹의 표본이 하나도 없으면 전체 평균으로
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
    groupSizes: {
      "백인·무전과": g00 ? g00.n : 0,
      "백인·전과있음": g10 ? g10.n : 0,
      "흑인·무전과": g01 ? g01.n : 0,
    },
  };
}

function scoreBiased(race, priorRecord, w) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  const b = race === "흑인" ? 1 : 0;
  return w.intercept + p * w.wPrior + b * w.wRace;
}

function scoreFair(priorRecord, w) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  return w.intercept + p * w.wPrior;
}

function verdictSuffix(flagged) {
  return flagged
    ? `≥ ${fmt(THRESHOLD)} → ${FLAGGED_LABEL}`
    : `< ${fmt(THRESHOLD)} → ${CLEARED_LABEL}`;
}

function biasedFormula(race, priorRecord, w, score, flagged) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  const b = race === "흑인" ? 1 : 0;
  return (
    `${fmt(w.intercept)} + (전과있음:${p} × ${fmt(w.wPrior)}) + (흑인:${b} × ${fmt(w.wRace)}) ` +
    `= ${fmt(score)}  ${verdictSuffix(flagged)}`
  );
}

function fairFormula(priorRecord, w, score, flagged) {
  const p = priorRecord === "전과있음" ? 1 : 0;
  return (
    `${fmt(w.intercept)} + (전과있음:${p} × ${fmt(w.wPrior)}) ` +
    `= ${fmt(score)}  ${verdictSuffix(flagged)}`
  );
}

/** 용의자 1명에 대해, 학습된 가중치(w)로 두 모델을 모두 실행해 비교 결과를 반환한다. */
function analyzeRow(suspectId, race, priorRecord, w) {
  const bScore = scoreBiased(race, priorRecord, w);
  const fScore = scoreFair(priorRecord, w);
  const bFlagged = bScore >= THRESHOLD;
  const fFlagged = fScore >= THRESHOLD;

  return {
    suspect_id: suspectId,
    race,
    prior_record: priorRecord,
    biased_score: round2(bScore),
    biased_result: bFlagged ? FLAGGED_LABEL : CLEARED_LABEL,
    biased_flagged: bFlagged,
    biased_formula: biasedFormula(race, priorRecord, w, bScore, bFlagged),
    fair_score: round2(fScore),
    fair_result: fFlagged ? FLAGGED_LABEL : CLEARED_LABEL,
    fair_flagged: fFlagged,
    fair_formula: fairFormula(priorRecord, w, fScore, fFlagged),
    is_flipped: bFlagged && !fFlagged,
  };
}
