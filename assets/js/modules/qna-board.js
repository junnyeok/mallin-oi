// assets/js/modules/qna-board.js
import { initInquiryBoard } from './inquiry-board.js';

export async function initQnaBoard() {
  await initInquiryBoard({
    boardType: 'qna',
    boardTitle: 'Q&A',
    emptyText: '아직 등록된 질문이 없어. 첫 번째 질문을 남겨봐.',
    bodyRequiredText: '질문 내용을 입력해줘.',
    bodyTooLongText: '질문은 1000자 이하로 입력해줘.',
    submitSuccessText: '질문이 등록됐어.',
    submitFailText: '질문 등록에 실패했어. 잠시 후 다시 시도해줘.',
    loginHintLoggedIn: '로그인 상태야. 질문을 남길 수 있어.',
    loginHintLoggedOut: '로그인 후 질문 작성이 가능해.',
    loginRedirectText: '로그인이 필요해.',
    bodyPlaceholderText: '질문을 입력해줘.',
    secretToggleLabel: '비밀 질문',
    secretLockedText: '🔒 비밀 질문입니다.',
    unlockPlaceholderText: '비밀번호를 입력해줘.',
    unlockButtonText: '열기',
    unlockFailText: '비밀번호가 일치하지 않아.',
    adminReplyPlaceholderText: '관리자 답변을 입력해줘.',
    exampleRootId: '',
  });
}
