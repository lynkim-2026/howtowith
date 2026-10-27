# Howtowith

엑셀에 정리한 영어 표현을 스마트폰에서 복습하는 개인용 PWA. 서버·유료 API 없이 브라우저(IndexedDB)에만 저장됩니다.

- **복습**: ts-fsrs 5.4.2(MIT)로 다음 복습일 자동 계산 (다시/어려움/좋음/쉬움)
- **모드**: 한→영(입력 가능) · 영→한 · 랜덤 · 틀린 표현 집중 · 카테고리별 · 오늘의 복습
- **엑셀**: 모든 시트 자동 탐색, 시트 이름 = 카테고리, 빈 행/중복 제거, 재업로드해도 학습 기록 유지
- **음성**: PC에서 VoiceStudio로 만든 mp3 재생(1× / 0.8× / 반복 / 자동재생 / 오프라인), 없으면 휴대폰 기본 TTS
- **백업**: JSON 백업/복원 (브라우저 데이터 삭제에 대비)

## 매일 쓰는 방법 (PC에서 정리 → 앱이 자동 반영)

1. PC에서 `Howtowith.xlsx`에 문장을 추가하고 저장합니다.
2. 이 폴더에서 `npm run sync -- Howtowith.xlsx` 실행 (엑셀 → `app/data/expressions.json` 변환 후 commit/push).
3. 몇 분 뒤 Pages 배포가 끝나면, 휴대폰에서 앱을 열 때 **새 표현만 자동 추가**됩니다 (기존 학습 기록 유지, 앱에서 삭제한 표현은 다시 들어오지 않음).

변환만 하려면 `npm run publish -- Howtowith.xlsx`. 앱의 "엑셀 업로드"는 보조 수단으로 남아 있습니다.

> 주의: 이 방식은 문장(한글·영어)이 GitHub Pages에 올라가므로 저장소가 public이면 누구나 볼 수 있습니다.

## 폴더

```
app/        배포되는 앱 (GitHub Pages가 이 폴더를 그대로 서비스)
  vendor/   ts-fsrs, read-excel-file (라이선스 파일 포함, CDN 사용 안 함)
  audio/    생성된 음성 + index.json (표현 키 → 파일)
scripts/    publish-data.mjs (엑셀 → 앱 데이터), make-audio.mjs (PC에서 음성 생성)
  data/     expressions.json (앱이 시작할 때 읽는 표현 목록)
tests/      로직 테스트 (npm test)
```

## 로컬 실행

```
npm install
npm start        # http://localhost:8080
npm test
```

## GitHub Pages 배포 (무료)

1. GitHub에 새 저장소를 만들고 이 폴더를 push (`main` 브랜치).
2. 저장소 **Settings → Pages → Source: GitHub Actions** 선택.
3. push 하면 `.github/workflows/pages.yml`이 `app/`을 배포합니다. 주소: `https://<계정>.github.io/<저장소>/`
4. Android Chrome에서 주소를 열고 메뉴 → **홈 화면에 추가/앱 설치**.

모든 경로가 상대경로라 저장소 이름과 무관하게 동작합니다. `Howtowith.xlsx`는 `.gitignore`로 제외돼 올라가지 않습니다.

## 영어 음성 만들기 (VoiceStudio, PC에서만)

음성은 **PC에서 한 번 생성**하고 앱은 재생만 합니다. 문장마다 **3가지 목소리**(여성 / 남성 / 저음 남성, 모두 미국 영어)로 만들며, 앱의 학습 카드(`목소리` 버튼)와 관리 화면에서 골라 들을 수 있습니다. 새 문장을 추가하면 **없는 문장·목소리만** 생성합니다. 목소리는 `scripts/make-audio.mjs`의 `VOICES`(OmniVoice 음성 설계 태그 + 고정 seed)에서 바꿀 수 있습니다.

1. VoiceStudio 설치 (설치·모델 다운로드 약 10GB, 설치 전 확인 필요): <https://github.com/debpalash/VoiceStudio>
   - 권장: NVIDIA GPU VRAM 6GB↑ (CPU도 가능하나 느림), 디스크 여유 10GB↑, Windows 10/11 x64
2. VoiceStudio 앱을 실행해 둔 채로(로컬 API `http://127.0.0.1:3900`):
   ```
   npm run audio -- Howtowith.xlsx --dry-run   # 생성할 문장만 확인
   npm run audio -- Howtowith.xlsx             # 없는 문장만 생성
   ```
   옵션: `--url`, `--voice`, `--format mp3|wav`. 실패한 문장은 앱에서 휴대폰 기본 음성으로 자동 대체됩니다.
3. `app/audio/`를 커밋하고 push → 앱이 새 음성을 사용. 앱 **관리 → 영어 음성 → 음성 오프라인 저장**으로 휴대폰에 저장.

### 라이선스 주의

- VoiceStudio 앱: AGPL-3.0 (이 프로젝트는 VoiceStudio를 수정·배포하지 않고 API만 호출).
- 기본 모델 OmniVoice 가중치: **CC-BY-NC(비상업)** + Higgs Audio / Llama 약관(별도). 개인 학습용으로만 사용하고, 생성 음성을 공개 저장소에 올릴 경우 출처 표기가 필요합니다(앱 관리 화면에 표기됨). 상업적 이용은 별도 확인이 필요합니다.
- 공개를 원하지 않으면 저장소를 private으로 두세요 (private 저장소의 Pages는 유료 플랜 필요).

## 보안 점검 요약

Cloudflare security-audit-skill의 점검 관점(입력 경계, 클라이언트 DOM 주입, 공급망, 로컬 데이터)을 이 앱 규모에 맞게 적용했습니다.

| 대상 | 조치 |
|---|---|
| 엑셀 업로드 | `.xlsx`·5MB·zip 시그니처 검사, zip 폭탄 가드(압축 해제 100MB 상한), 행/셀 길이 제한 |
| XSS | `innerHTML` 미사용(전부 text node), CSP 메타(`script-src 'self'`, 인라인 스크립트/스타일 금지), 악성 문자열 e2e 테스트 |
| 외부 라이브러리 | 2개만 사용, `vendor/`에 고정 복사(CDN 없음), `npm audit` 0건. SheetJS(`xlsx`)는 알려진 취약점 때문에 제외 |
| 로컬 저장 | IndexedDB 단독. 백업 복원은 화이트리스트 검증·값 범위 제한. 백업 JSON은 암호화되지 않으므로 보관에 유의 |
| 사용자 입력 | 검색·답안은 화면 표시와 비교에만 사용, 라우트 파라미터 안전 디코딩, 음성 파일명은 정규식 검증 |

한계: GitHub Pages는 HTTP 헤더를 설정할 수 없어 CSP를 `<meta>`로 적용했고(`frame-ancestors` 미지원), 데이터가 개인용 단일 사용자라 인증은 없습니다.
