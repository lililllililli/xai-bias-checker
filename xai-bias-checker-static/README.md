# XAI 편향 감사 — 정적 사이트 버전 (서버/DB 없음)

CSV를 올리면 "편향 모델" vs "공정 모델" 판정을 나란히 비교해서 보여주는
교육/감사용 웹사이트입니다. **서버도, 데이터베이스도 없습니다.** CSV를
브라우저 안에서 바로 읽고 계산해서 화면에 그립니다. 파일이 어디로도
전송되지 않으니 배포가 훨씬 간단합니다.

> 실제 수사·양형 판단에 사용되어서는 안 되는, 알고리즘 편향을 보여주기 위한
> 합성 데이터 기반 시연 도구입니다.

## 이전 Flask 버전과 다른 점

- `backend/` 폴더가 통째로 사라졌습니다. `backend/model.py`의 점수 계산 +
  XAI 해설 로직을 `js/model.js`로 그대로 옮겼습니다 (같은 결과가 나오는지
  Node로 대조 확인함).
- SQLite/분석 이력 저장 기능은 없습니다. 방문할 때마다 그 세션에서 올린
  CSV만 계산해서 보여줍니다. (여러 사용자의 분석 기록을 서버에 쌓아두고
  싶다면 별도 DB가 필요한데, 그건 이번 요청 범위 밖입니다.)
- 파일이 `index.html`, `css/style.css`, `js/model.js`, `js/app.js`,
  `suspects_sample.csv` 다섯 개뿐입니다. 빌드 과정도 없습니다.

## 기능

1. **CSV 일괄 대조**: 여러 명의 데이터를 CSV로 한 번에 올려서 사건별로 비교
2. **신규 인물 즉시 판단** (새로 추가됨): 인종/전과 이력을 직접 선택해서
   한 명에 대한 판단을 바로 확인. CSV 없이도 바로 써볼 수 있습니다.

두 기능 모두 서버로 아무 것도 전송하지 않고 브라우저 안에서만 계산됩니다.

## Vercel에 배포하는 방법

**방법 A — 웹사이트에서 드래그앤드롭 (제일 쉬움, 계정만 있으면 됨)**

1. https://vercel.com 가입/로그인
2. 대시보드에서 "Add New…" → "Project" 클릭
3. 화면에 나오는 업로드 영역에 이 폴더(`xai-bias-checker-static`)를
   통째로 끌어다 놓습니다. (프레임워크 선택은 "Other"로 두면 됩니다 —
   빌드 명령이 필요 없는 순수 정적 사이트라서요.)
4. "Deploy" 클릭 → 몇십 초 후 `https://프로젝트이름.vercel.app` 주소가 나옵니다.

**방법 B — GitHub 연동 (수정할 때마다 자동 재배포하고 싶다면)**

1. 이 폴더를 새 GitHub 저장소에 올립니다.
   ```bash
   cd xai-bias-checker-static
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin <본인의-github-저장소-주소>
   git push -u origin main
   ```
2. Vercel 대시보드 → "Add New…" → "Project" → 방금 만든 저장소 선택
3. Framework Preset은 "Other" 선택 (Build Command, Output Directory 비워둠)
4. "Deploy" 클릭

**방법 C — Vercel CLI (터미널이 편하다면)**

```bash
npm install -g vercel
cd xai-bias-checker-static
vercel
```
질문에 답하면서 진행하면 되고, 마지막에 배포 URL이 출력됩니다.
이후 수정하고 다시 배포할 땐 `vercel --prod`.

## 로컬에서 미리 확인하고 싶다면

빌드도 서버도 필요 없어서 그냥 `index.html`을 브라우저로 열어도 되지만,
브라우저 보안 정책 때문에 `file://`로 열면 폰트 로딩 등이 불안정할 수 있어
아래처럼 간단히 로컬 서버를 띄우는 걸 권장합니다.

```bash
cd xai-bias-checker-static
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 접속.

## 파일 구조

```
xai-bias-checker-static/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── model.js     # 점수 산식 + XAI 자연어 해설 (순수 JS, 프레임워크 없음)
│   └── app.js        # CSV 파싱, 드래그앤드롭, 결과 렌더링
└── suspects_sample.csv
```
