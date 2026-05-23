// assets/js/modules/suggestions-board.js
import { initInquiryBoard } from './inquiry-board.js';

export async function initSuggestionsBoard() {
  await initInquiryBoard({
    boardType: 'suggestion',
    boardTitle: '건의사항',
    emptyText: '아직 등록된 건의사항이 없어. 첫 번째 건의사항을 남겨봐.',
    bodyRequiredText: '건의사항 내용을 입력해줘.',
    bodyTooLongText: '건의사항은 1000자 이하로 입력해줘.',
    submitSuccessText: '건의사항이 등록됐어.',
    submitFailText: '건의사항 등록에 실패했어. 잠시 후 다시 시도해줘.',
    loginHintLoggedIn: '로그인 상태야. 건의사항을 남길 수 있어.',
    loginHintLoggedOut: '로그인 후 건의사항 작성이 가능해.',
    loginRedirectText: '로그인이 필요해.',
    bodyPlaceholderText: '건의사항을 남겨줘.',
    secretToggleLabel: '비밀 건의사항',
    secretLockedText: '🔒 비밀 건의사항입니다.',
    unlockPlaceholderText: '비밀번호를 입력해줘.',
    unlockButtonText: '열기',
    unlockFailText: '비밀번호가 일치하지 않아.',
    adminReplyPlaceholderText: '관리자 댓글을 입력해줘.',
    exampleRootId: '',
  });
}
