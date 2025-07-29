from django.core.management.base import BaseCommand
import os
from django.conf import settings
from ai_generator.models import PaperDraft

class Command(BaseCommand):
    help = 'Update all PaperDraft objects whose ai_meta_data["generated_paper_path"] ends with .zip to instead point to the corresponding .pdf file (if it exists).'

    def handle(self, *args, **options):
        updated = 0
        skipped = 0
        for draft in PaperDraft.objects.all():
            ai_meta = draft.ai_meta_data or {}
            path = ai_meta.get('generated_paper_path')
            if path and path.endswith('.zip'):
                # Extract the base filename
                base = os.path.basename(path)[:-4]  # remove .zip
                pdf_filename = base + '.pdf'
                pdf_path = os.path.join('media', 'papers', pdf_filename)
                abs_pdf_path = os.path.join(settings.BASE_DIR, pdf_path)
                if os.path.exists(abs_pdf_path):
                    ai_meta['generated_paper_path'] = pdf_path
                    draft.ai_meta_data = ai_meta
                    draft.save(update_fields=['ai_meta_data'])
                    self.stdout.write(self.style.SUCCESS(f"Updated draft {draft.id}: {path} -> {pdf_path}"))
                    updated += 1
                else:
                    self.stdout.write(self.style.WARNING(f"Skipped draft {draft.id}: PDF does not exist for {pdf_path}"))
                    skipped += 1
        self.stdout.write(self.style.SUCCESS(f"Done. Updated: {updated}, Skipped: {skipped}")) 