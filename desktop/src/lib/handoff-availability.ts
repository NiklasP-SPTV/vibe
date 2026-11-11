/**
 * Phone handoff is switched off in this fork (IT review M9): its phone web app comes from the
 * original developer's site. The backend refuses to start it; this keeps its entry points out of
 * the interface. Mirrors `handoff::AVAILABLE` in the backend.
 */
export const HANDOFF_AVAILABLE = false
