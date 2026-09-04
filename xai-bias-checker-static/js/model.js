/**
 * model.js
 * '편향 모델(Biased)'과 '공정 모델(Fair)' 두 개의 단순 규칙 기반 스코어러.
 * Python 버전(backend/model.py)과 동일한 로직을 그대로 이식한 것이다.
 *
 * 원래 PRD는 임계값을 1.8로 정의했으나, 흑인+무전과 조합의 점수(1.7)가
 * 임계값(1.8)에 미달해 "무전과 흑인이 오탐된다"는 핵심 시연 시나리오가
 * 수학적으로 재현되지 않는 오류가 있었다. 임계값을 1.7로 보정했다.
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

function biasedReason(race, priorRecord, flagged) {
  const prior = priorRecord === "전과있음";
  const black = race === "흑인";

  if (flagged && prior && black) {
    return "전과 이력('전과있음')과 인종(흑인) 요소가 모두 반영되어 유력 용의자로 강하게 특정됨.";
  }
  if (flagged && prior && !black) {
    return "전과 이력('전과있음')이 유력 용의자 특정의 사유로 작동함. 인종 요소는 가중되지 않음(백인).";
  }
  if (flagged && black && !prior) {
    return "전과가 없는 상태(무전과)임에도, 인종(흑인) 요소가 유력 용의자 특정의 결정적 사유로 작동함.";
  }
  return "전과 이력이 없고(무전과) 인종 가중 요소도 없어(백인), 용의선상에서 정상 제외됨.";
}

function fairReason(priorRecord, flagged) {
  if (flagged) {
    return "인종 요소를 배제하고 평가한 결과, '전과있음' 이력만으로 기준치를 충족하여 유력 용의자로 특정됨.";
  }
  return "인종 요소를 배제하고 평가한 결과, '무전과' 상태이므로 용의선상에서 정상 제외됨.";
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
    biased_xai_reason: biasedReason(race, priorRecord, bFlagged),
    fair_score: Math.round(fScore * 100) / 100,
    fair_result: fFlagged ? FLAGGED_LABEL : CLEARED_LABEL,
    fair_flagged: fFlagged,
    fair_xai_reason: fairReason(priorRecord, fFlagged),
    is_flipped: bFlagged && !fFlagged,
  };
}
