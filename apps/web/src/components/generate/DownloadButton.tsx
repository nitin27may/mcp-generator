import { buttonVariants } from '@/components/ui/button';
import { en } from '@/i18n/en';

/**
 * A real `<a download>`, not a fetch+`URL.createObjectURL` dance — the
 * accessible, keyboard-native download pattern (TIP §51 D4). Styled with
 * `buttonVariants` rather than the `Button` component for the same reason
 * `StepFooter`'s navigation links are (TIP §93 C26): this triggers a
 * browser-native download, closer to navigation than to an in-place action.
 */
export function DownloadButton({ downloadUrl }: { downloadUrl: string }) {
  return (
    <a href={downloadUrl} download className={buttonVariants({ variant: 'default' })}>
      {en.generateDownload}
    </a>
  );
}
