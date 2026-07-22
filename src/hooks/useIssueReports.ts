import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { uploadUserFile } from '@/src/lib/storage-upload';
import type { PickedImage } from '@/src/lib/image-picker';
import { showToast } from '@/src/state/toast-store';

export type ReporterRole = 'contestant' | 'producer';

// Distinct from useReporting.ts (event_reports/user_reports) - those are
// content-moderation reports about another person's conduct or a listing's
// accuracy. This is "something in the app itself is broken" - a bug
// report, triaged by reading the issue_reports table directly (see the
// evening check-in routine), not something that emails anyone
// automatically on submit.
export function useSubmitIssueReport() {
  return useMutation({
    mutationFn: async (params: {
      role: ReporterRole;
      description: string;
      pageContext: string;
      reporterNameOverride?: string;
      screenshot?: PickedImage;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired - sign in again');

      // Unlike avatar/verification uploads (one fixed filename, always
      // overwritten), a reporter can file more than one issue, so each
      // screenshot needs its own filename rather than clobbering the last.
      const screenshotPath = params.screenshot
        ? await uploadUserFile('issue-screenshots', user.id, params.screenshot, `issue-${Date.now()}`)
        : null;

      const { error } = await supabase.from('issue_reports').insert({
        role: params.role,
        description: params.description,
        page_context: params.pageContext,
        reporter_name_override: params.reporterNameOverride?.trim() || null,
        screenshot_path: screenshotPath,
      });
      if (error) throw error;
    },
    onSuccess: () => showToast("Thanks - we've got your report and will look into it."),
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not submit report - try again'),
  });
}
