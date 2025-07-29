from django.core.management.base import BaseCommand
from ai_generator.models import PaperReviewAssignment

class Command(BaseCommand):
    help = 'Delete all PaperReviewAssignment objects (removes all previous review assignments).'
 
    def handle(self, *args, **options):
        count = PaperReviewAssignment.objects.count()
        PaperReviewAssignment.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {count} review assignments.')) 