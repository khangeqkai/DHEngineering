import { createContext, useContext } from 'react';

// What a job screen needs from the person's @mention questions: `mentionsAnsweredOnJob(jobId)`,
// told when a comment was posted on a job so that job's row goes at once. Filled by
// FinishQuestionProvider.jsx; split from it for the same reason as FinishQuestionContext.
export const MentionsContext = createContext(null);

// Null outside the shell, so a screen shown without it just skips the call.
export function useMentions() {
  return useContext(MentionsContext);
}
