/**
 * model.js
 * '편향 모델(Biased)'과 '공정 모델(Fair)' 두 개의 단순 규칙 기반 스코어러.
 * Python 버전(backend/model.py)과 동일한 로직을 그대로 이식한 것이다.
 *
 * 원래 PRD는 임계값을 1.8로 정의했으나, 흑인+무전과 조합의 점수(1.7)가
 * 임계값(1.8)에 미달해 "무전과 흑인이 오탐된다"는 핵심 시연 시나리오가
 * 수학적으로 재현되지 않는 오류가 있었다. 임계값을 1.7로 보정했다.
 *
 * 결과 화면에는 모델이 스스로 판단 이유를 설명하는 서술형 문장을 쓰지 않고,
 * 아래 가중치 산식을 그대로 노출한다. "왜 이렇게 판단했는지"는 산식 자체에
 * 이미 다 들어있고, 사람이 직접 값을 대입해서 검증할 수 있어야 하기 때문이다.
 *
 * 주의: 실제 수사 도구가 아니라 알고리즘 편향의 작동 방식을 보여주기 위한
 * 합성 데이터 기반 교육용 시연 모델이다.
 */

const PRIOR_WEIGHT = 2.0;
const RACE_WEIGHT = 1.7;
const THRESHOLD = 1.7;

const FLAGGED_LABEL = "유력 용의자 특정";
const CLEARED_LABEL = "용의선상 제외";

function scoreBiased(race, priorRecord) {
  const prior = priorRecord === "전과있음" ? 1 : 0;
  const black = race === "흑인" ? 1 : 0;
  return prior * PRIOR_WEIGHT + black * RACE_WEIGHT;
}

function scoreFair(priorRecord) {
  const prior = priorRecord === "전과있음" ? 1 : 0;
  return prior * PRIOR_WEIGHT;
}

function fmt(n) {
  return n.toFixed(2);
}

/** 편향 모델의 산식을 대입값까지 그대로 문자열로 보여준다. */
function biasedFormula(race, priorRecord, score, flagged) {
  const prior = priorRecord === "전과있음" ? 1 : 0;
  const black = race === "흑인" ? 1 : 0;
  const verdict = flagged ? `≥ ${fmt(THRESHOLD)} → ${FLAGGED_LABEL}` : `< ${fmt(THRESHOLD)} → ${CLEARED_LABEL}`;
  return (
    `(전과있음:${prior} × ${fmt(PRIOR_WEIGHT)}) + (흑인:${black} × ${fmt(RACE_WEIGHT)}) ` +
    `= ${fmt(score)}  ${verdict}`
  );
}

/** 공정 모델의 산식을 대입값까지 그대로 문자열로 보여준다 (인종 항 자체가 없음). */
function fairFormula(priorRecord, score, flagged) {
  const prior = priorRecord === "전과있음" ? 1 : 0;
  const verdict = flagged ? `≥ ${fmt(THRESHOLD)} → ${FLAGGED_LABEL}` : `< ${fmt(THRESHOLD)} → ${CLEARED_LABEL}`;
  return `(전과있음:${prior} × ${fmt(PRIOR_WEIGHT)}) = ${fmt(score)}  ${verdict}`;
}

/** 용의자 1명에 대해 두 모델을 모두 실행하고 비교 결과를 반환한다. */
function analyzeRow(suspectId, race, priorRecord) {
  const bScore = scoreBiased(race, priorRecord);
  const fScore = scoreFair(priorRecord);
  const bFlagged = bScore >= THRESHOLD;
  const fFlagged = fScore >= THRESHOLD;

  return {
    suspect_id: suspectId,
    race,
    prior_record: priorRecord,
    biased_score: Math.round(bScore * 100) / 100,
    biased_result: bFlagged ? FLAGGED_LABEL : CLEARED_LABEL,
    biased_flagged: bFlagged,
    biased_formula: biasedFormula(race, priorRecord, bScore, bFlagged),
    fair_score: Math.round(fScore * 100) / 100,
    fair_result: fFlagged ? FLAGGED_LABEL : CLEARED_LABEL,
    fair_flagged: fFlagged,
    fair_formula: fairFormula(priorRecord, fScore, fFlagged),
    is_flipped: bFlagged && !fFlagged,
  };
}
