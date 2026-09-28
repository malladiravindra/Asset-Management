from django.core.management.base import BaseCommand

from notifications.services import generate_scheduled_notifications


class Command(BaseCommand):
    help = (
        "Create in-app notifications for time-based conditions: warranties expiring/expired, "
        "overdue maintenance and repairs, software licenses expiring/expired. Safe to run "
        "repeatedly (deduplicated per user and event) — schedule it daily, e.g. with cron or "
        "Windows Task Scheduler."
    )

    def handle(self, *args, **options):
        created = generate_scheduled_notifications()
        total = sum(created.values())
        for notification_type, count in sorted(created.items()):
            self.stdout.write(f"  {notification_type}: {count}")
        self.stdout.write(self.style.SUCCESS(f"Created {total} notification(s)."))
