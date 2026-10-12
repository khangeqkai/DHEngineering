import { createContext, useContext } from 'react';

// The shared value for the worker's "your clock stopped by itself" questions. The
// provider that fills it lives in FinishQuestionProvider.jsx; it is split from this file
// because the provider mounts the job screen, and the job screen reads this context.
export const FinishQuestionContext = createContext(null);

// Null outside the shell, so a screen that can also be shown without it (a test, the
// sign-in page) just skips the refresh.
export function useFinishQuestion() {
  return useContext(FinishQuestionContext);
}
