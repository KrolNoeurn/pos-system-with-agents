"""Idempotent management command to populate realistic bilingual POS demo data for testing."""

from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.accounts.services import create_user_account
from apps.catalog.models import Category, Product, Unit
from apps.catalog.services import create_category, create_product, create_unit
from apps.expenses.models import Expense, ExpenseCategory
from apps.expenses.services import create_expense, create_expense_category
from apps.inventory.models import StockMovement
from apps.inventory.services import record_opening_stock, record_stock_adjustment
from apps.purchasing.models import Purchase, Supplier
from apps.purchasing.services import create_purchase, create_supplier, receive_purchase
from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac
from apps.sales.models import Customer, Sale
from apps.sales.services import cancel_sale, checkout_sale, create_customer, refund_sale
from apps.store_settings.services import update_store_settings

User = get_user_model()


def _make_badge_png(filename: str, bg_rgb: tuple[int, int, int], accent_rgb: tuple[int, int, int]) -> SimpleUploadedFile:
    """Generate a clean lightweight PNG thumbnail for demo avatars and products."""
    img = Image.new("RGB", (240, 240), color=bg_rgb)
    draw = ImageDraw.Draw(img)
    draw.ellipse((44, 44, 196, 196), fill=accent_rgb)
    draw.ellipse((84, 84, 156, 156), fill=(255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return SimpleUploadedFile(filename, buf.getvalue(), content_type="image/png")


class Command(BaseCommand):
    help = "Idempotently seed realistic bilingual (EN/KM) POS demo data across all modules for testing."

    def handle(self, *args, **options):
        sync_default_rbac()

        # 1. Super Admin & Role-Based Staff Accounts
        super_admin_role = Role.objects.get(slug="super_admin")
        admin = User.objects.filter(username="admin").first()
        if admin is None:
            admin = User.objects.create_superuser(
                username="admin",
                email="admin@pos.local",
                password="Admin@POS2026!",
                full_name="System Super Admin",
                phone="012 800 900",
            )
            admin.roles.add(super_admin_role)
        if not admin.avatar:
            admin.avatar = _make_badge_png("admin_avatar.png", (30, 64, 175), (96, 165, 250))
            admin.save(update_fields=["avatar", "updated_at"])

        demo_staff_specs = [
            ("manager", "manager@pos.local", "PosDemo#2026!", "Dara Sok", "012 345 601", "manager", (15, 118, 110), (94, 234, 212)),
            ("cashier", "cashier@pos.local", "PosDemo#2026!", "Sreyneang Pich", "012 345 602", "cashier", (126, 34, 206), (216, 180, 254)),
            ("stock", "stock@pos.local", "PosDemo#2026!", "Vannak Keo", "012 345 603", "inventory_clerk", (180, 83, 9), (253, 186, 116)),
            ("accountant", "accountant@pos.local", "PosDemo#2026!", "Sophea Chea", "012 345 604", "accountant", (29, 78, 216), (147, 197, 253)),
        ]
        staff_by_username = {"admin": admin}
        created_users = 0
        for username, email, pwd, full_name, phone, role_slug, bg, accent in demo_staff_specs:
            user = User.objects.filter(username=username).first()
            if user is None:
                role = Role.objects.get(slug=role_slug)
                user = create_user_account(
                    actor=admin,
                    username=username,
                    email=email,
                    password=pwd,
                    full_name=full_name,
                    phone=phone,
                    avatar=_make_badge_png(f"{username}_avatar.png", bg, accent),
                    role_ids=[role.id],
                )
                created_users += 1
            staff_by_username[username] = user

        manager = staff_by_username["manager"]
        cashier = staff_by_username["cashier"]

        # 2. Store Settings
        update_store_settings(
            actor=admin,
            store_name="Angkor Mart & Cafe",
            store_name_km="អង្គរ ម៉ាត និង កាហ្វេ",
            tagline="Fresh Coffee & Daily Essentials",
            phone="023 888 999 / 012 888 999",
            email="hello@angkormart.local",
            address="No. 45, Street 271, Sangkat Boeung Tumpun, Phnom Penh",
            address_km="ផ្ទះលេខ ៤៥ ផ្លូវ ២៧១ សង្កាត់បឹងទំពុន រាជធានីភ្នំពេញ",
            tax_id="K001-902600123",
            currency_code="USD",
            currency_symbol="$",
            exchange_rate_khr=Decimal("4100.00"),
            default_tax_rate=Decimal("10.00"),
            receipt_header="Welcome to Angkor Mart & Cafe",
            receipt_footer="Thank you for shopping with us! Goods sold are exchangeable within 7 days.",
            receipt_footer_km="សូមអរគុណសម្រាប់ការទិញទំនិញ! សូមអញ្ជើញមកម្តងទៀត។",
            show_khr_on_receipt=True,
            show_tax_id_on_receipt=True,
        )

        # 3. Categories
        cat_specs = [
            ("Beverages", "ភេសជ្ជៈ", None, "Cold drinks, bottled water, and juices"),
            ("Coffee & Tea", "កាហ្វេ និង តែ", "Beverages", "Freshly brewed coffee and tea drinks"),
            ("Snacks & Bakery", "អាហារសម្រន់ និង នំប៉័ង", None, "Pastries, croissants, and packaged snacks"),
            ("Fresh Produce", "ផ្លែឈើ និង បន្លែស្រស់", None, "Local seasonal fruits and organic produce"),
            ("Dairy & Chilled", "ទឹកដោះគោ និង អាហារត្រជាក់", None, "Fresh milk, yogurt, and chilled products"),
            ("Household Essentials", "សម្ភារៈប្រើប្រាស់ក្នុងផ្ទះ", None, "Daily hygiene and home care goods"),
        ]
        categories = {}
        for name, name_km, parent_name, desc in cat_specs:
            cat = Category.objects.filter(name__iexact=name).first()
            if cat is None:
                cat = create_category(
                    actor=admin,
                    name=name,
                    name_km=name_km,
                    parent=categories.get(parent_name) if parent_name else None,
                    description=desc,
                )
            categories[name] = cat

        # 4. Units of Measure
        unit_specs = [
            ("Piece", "ដុំ", "pcs", Unit.UnitType.COUNT, False, None, Decimal("1.000000")),
            ("Box (12 pcs)", "ប្រអប់ (១២ដុំ)", "box", Unit.UnitType.COUNT, False, "pcs", Decimal("12.000000")),
            ("Bottle", "ដប", "btl", Unit.UnitType.COUNT, False, None, Decimal("1.000000")),
            ("Cup", "កែវ", "cup", Unit.UnitType.COUNT, False, None, Decimal("1.000000")),
            ("Kilogram", "គីឡូក្រាម", "kg", Unit.UnitType.WEIGHT, True, None, Decimal("1.000000")),
            ("Liter", "លីត្រ", "L", Unit.UnitType.VOLUME, True, None, Decimal("1.000000")),
        ]
        units = {}
        for name, name_km, abbr, utype, allow_dec, base_abbr, factor in unit_specs:
            unit = Unit.objects.filter(abbreviation__iexact=abbr).first()
            if unit is None:
                unit = create_unit(
                    actor=admin,
                    name=name,
                    name_km=name_km,
                    abbreviation=abbr,
                    unit_type=utype,
                    allow_decimal=allow_dec,
                    base_unit=units.get(base_abbr) if base_abbr else None,
                    conversion_factor=factor,
                )
            units[abbr] = unit

        # 5. Products (12 bilingual items with thumbnails)
        product_specs = [
            ("COF-001", "8850001000011", "Iced Latte", "ឡាតេទឹកកក", "Coffee & Tea", "cup", Decimal("1.10"), Decimal("2.75"), Decimal("2.40"), Decimal("10.00"), Decimal("10.000"), Decimal("45.000"), (120, 72, 42), (214, 169, 128)),
            ("COF-002", "8850001000028", "Khmer Iced Coffee", "កាហ្វេទឹកកកខ្មែរ", "Coffee & Tea", "cup", Decimal("0.85"), Decimal("2.25"), Decimal("1.90"), Decimal("10.00"), Decimal("12.000"), Decimal("50.000"), (78, 42, 24), (180, 120, 72)),
            ("TEA-001", "8850001000035", "Matcha Green Tea", "តែបៃតងម៉ាត់ឆា", "Coffee & Tea", "cup", Decimal("1.20"), Decimal("3.00"), Decimal("2.60"), Decimal("10.00"), Decimal("8.000"), Decimal("7.000"), (22, 101, 52), (134, 239, 172)),
            ("BEV-001", "8850001000042", "Angkor Mineral Water 500ml", "ទឹកសុទ្ធអង្គរ 500ml", "Beverages", "btl", Decimal("0.25"), Decimal("0.60"), Decimal("0.45"), Decimal("0.00"), Decimal("24.000"), Decimal("120.000"), (3, 105, 161), (125, 211, 252)),
            ("BEV-002", "8850001000059", "Fresh Orange Juice", "ទឹកក្រូចច្របាច់ស្រស់", "Beverages", "btl", Decimal("1.00"), Decimal("2.50"), Decimal("2.10"), Decimal("10.00"), Decimal("10.000"), Decimal("32.000"), (234, 88, 12), (253, 186, 116)),
            ("SNK-001", "8850001000066", "Butter Croissant", "នំក្រូសង់ប៊័រ", "Snacks & Bakery", "pcs", Decimal("0.90"), Decimal("2.20"), Decimal("1.80"), Decimal("10.00"), Decimal("10.000"), Decimal("8.000"), (180, 83, 9), (253, 224, 71)),
            ("SNK-002", "8850001000073", "Seaweed Rice Crackers", "នំស្រួយសារ៉ាយ", "Snacks & Bakery", "pcs", Decimal("0.75"), Decimal("1.75"), Decimal("1.45"), Decimal("0.00"), Decimal("15.000"), Decimal("60.000"), (21, 128, 61), (187, 247, 208)),
            ("FRU-001", "8850001000080", "Kampot Mango", "ស្វាយកំពត", "Fresh Produce", "kg", Decimal("1.60"), Decimal("3.20"), Decimal("2.80"), Decimal("0.00"), Decimal("5.000"), Decimal("24.500"), (202, 138, 4), (254, 240, 138)),
            ("FRU-002", "8850001000097", "Organic Banana", "ចេកសរីរាង្គ", "Fresh Produce", "kg", Decimal("0.90"), Decimal("1.90"), Decimal("1.55"), Decimal("0.00"), Decimal("6.000"), Decimal("18.000"), (161, 98, 7), (253, 224, 71)),
            ("DRY-001", "8850001000103", "Fresh Whole Milk 1L", "ទឹកដោះគោស្រស់ 1L", "Dairy & Chilled", "L", Decimal("1.85"), Decimal("3.40"), Decimal("3.00"), Decimal("0.00"), Decimal("8.000"), Decimal("22.000"), (30, 64, 175), (191, 219, 254)),
            ("HSH-001", "8850001000110", "Tissue Box Soft", "ក្រដាសជូតមាត់", "Household Essentials", "box", Decimal("1.40"), Decimal("2.90"), Decimal("2.50"), Decimal("10.00"), Decimal("6.000"), Decimal("20.000"), (71, 85, 105), (203, 213, 225)),
            ("HSH-002", "8850001000127", "Hand Sanitizer 250ml", "ជែលលាងដៃ 250ml", "Household Essentials", "btl", Decimal("1.50"), Decimal("3.50"), Decimal("3.00"), Decimal("10.00"), Decimal("10.000"), Decimal("0.000"), (13, 148, 136), (153, 246, 228)),
        ]
        products = {}
        for sku, barcode, name, name_km, cat_name, unit_abbr, cost, sell, wholesale, tax, min_thr, opening_qty, bg, accent in product_specs:
            prod = Product.objects.filter(sku__iexact=sku).first()
            if prod is None:
                prod = create_product(
                    actor=admin,
                    sku=sku,
                    barcode=barcode,
                    name=name,
                    name_km=name_km,
                    description=f"{name} ({name_km}) — demo catalog item.",
                    image=_make_badge_png(f"{sku.lower()}.png", bg, accent),
                    category=categories[cat_name],
                    unit=units[unit_abbr],
                    purchase_cost=cost,
                    selling_price=sell,
                    wholesale_price=wholesale,
                    tax_rate=tax,
                    min_stock_threshold=min_thr,
                    track_inventory=True,
                )
            products[sku] = prod

            # Opening stock (idempotent — only once per product if > 0)
            if opening_qty > Decimal("0.000") and not StockMovement.objects.filter(
                product=prod, movement_type=StockMovement.MovementType.OPENING
            ).exists():
                record_opening_stock(
                    actor=admin,
                    product=prod,
                    quantity=opening_qty,
                    unit_cost=cost,
                    reference_code="OPEN-DEMO-01",
                    notes="Initial demo store opening inventory",
                )

        # Traced stock adjustment examples (idempotent by reference_code)
        if not StockMovement.objects.filter(reference_code="ADJ-DEMO-01").exists():
            record_stock_adjustment(
                actor=manager,
                product=products["SNK-001"],
                direction="decrease",
                quantity=Decimal("2.000"),
                reference_code="ADJ-DEMO-01",
                notes="Expired morning display croissants written off",
            )
        if not StockMovement.objects.filter(reference_code="ADJ-DEMO-02").exists():
            record_stock_adjustment(
                actor=manager,
                product=products["BEV-001"],
                direction="increase",
                quantity=Decimal("6.000"),
                unit_cost=Decimal("0.25"),
                reference_code="ADJ-DEMO-02",
                notes="Physical cycle count surplus found in backroom",
            )

        # 6. Suppliers
        supplier_specs = [
            ("Mekong Coffee Roasters", "Vicheka Sao", "023 441 100", "orders@mekongcoffee.local", "Street 63, BKK1, Phnom Penh"),
            ("Phnom Penh Beverage Co.", "Sovann Mey", "023 442 200", "sales@ppbev.local", "National Road 4, Phnom Penh"),
            ("Kampot Organic Farms", "Chanthou Reach", "033 932 500", "farm@kampotorganic.local", "Kampot Province, Cambodia"),
            ("Khmersmart Wholesale", "Rathana Ouk", "023 550 888", "wholesale@khmersmart.local", "Russian Blvd, Phnom Penh"),
        ]
        suppliers = {}
        for name, contact, phone, email, addr in supplier_specs:
            sup = Supplier.objects.filter(name__iexact=name).first()
            if sup is None:
                sup = create_supplier(
                    actor=admin,
                    name=name,
                    contact_name=contact,
                    phone=phone,
                    email=email,
                    address=addr,
                )
            suppliers[name] = sup

        # 7. Purchases (1 Received -> stock updated, 1 Ordered, 1 Draft)
        today = timezone.localdate()
        if not Purchase.objects.filter(notes__contains="[DEMO-PO-01]").exists():
            po1 = create_purchase(
                actor=manager,
                supplier=suppliers["Mekong Coffee Roasters"],
                items=[
                    {"product": products["COF-001"], "quantity": Decimal("25.000"), "unit_cost": Decimal("1.05")},
                    {"product": products["COF-002"], "quantity": Decimal("30.000"), "unit_cost": Decimal("0.80")},
                ],
                discount_amount=Decimal("2.00"),
                purchase_date=today - timedelta(days=3),
                expected_date=today - timedelta(days=2),
                notes="[DEMO-PO-01] Weekly coffee beans & cup restock",
                initial_status=Purchase.Status.ORDERED,
            )
            receive_purchase(actor=manager, purchase=po1, notes="Received in good condition")

        if not Purchase.objects.filter(notes__contains="[DEMO-PO-02]").exists():
            create_purchase(
                actor=manager,
                supplier=suppliers["Khmersmart Wholesale"],
                items=[
                    {"product": products["HSH-002"], "quantity": Decimal("30.000"), "unit_cost": Decimal("1.45")},
                    {"product": products["DRY-001"], "quantity": Decimal("15.000"), "unit_cost": Decimal("1.80")},
                ],
                discount_amount=Decimal("0.00"),
                purchase_date=today - timedelta(days=1),
                expected_date=today + timedelta(days=2),
                notes="[DEMO-PO-02] Pending restock for out-of-stock sanitizer and milk",
                initial_status=Purchase.Status.ORDERED,
            )

        if not Purchase.objects.filter(notes__contains="[DEMO-PO-03]").exists():
            create_purchase(
                actor=manager,
                supplier=suppliers["Kampot Organic Farms"],
                items=[
                    {"product": products["FRU-001"], "quantity": Decimal("15.000"), "unit_cost": Decimal("1.55")},
                    {"product": products["FRU-002"], "quantity": Decimal("12.000"), "unit_cost": Decimal("0.85")},
                ],
                discount_amount=Decimal("0.00"),
                purchase_date=today,
                expected_date=today + timedelta(days=3),
                notes="[DEMO-PO-03] Draft weekend fresh produce order",
                initial_status=Purchase.Status.DRAFT,
            )

        # 8. Customers
        customer_specs = [
            ("Sokha Chan", "012 701 111", "sokha@example.com", "Toul Kork, Phnom Penh", "VIP regular morning coffee"),
            ("Bopha Lim", "015 702 222", "bopha@example.com", "BKK1, Phnom Penh", "Prefers KHQR receipts"),
            ("Rithy Nhem", "077 703 333", "rithy@example.com", "Sen Sok, Phnom Penh", "Wholesale snacks buyer"),
            ("Channary Heng", "092 704 444", "channary@example.com", "Chroy Changvar, Phnom Penh", ""),
            ("Vichea Meas", "089 705 555", "vichea@example.com", "Meanchey, Phnom Penh", ""),
        ]
        customers = {}
        for name, phone, email, addr, notes in customer_specs:
            cust = Customer.objects.filter(name__iexact=name).first()
            if cust is None:
                cust = create_customer(
                    actor=admin,
                    name=name,
                    phone=phone,
                    email=email,
                    address=addr,
                    notes=notes,
                )
            customers[name] = cust

        # 9. Sales (idempotent via idempotency_key, spanning past 4 days + today)
        now = timezone.now()
        sale_specs = [
            {
                "key": "demo-sale-01",
                "actor": cashier,
                "customer": customers["Sokha Chan"],
                "items": [
                    {"product": products["COF-001"], "quantity": Decimal("2.000")},
                    {"product": products["SNK-001"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("0.00"),
                "payment_method": Sale.PaymentMethod.CASH,
                "paid_amount": Decimal("15.00"),
                "days_ago": 4,
                "notes": "Morning breakfast combo",
            },
            {
                "key": "demo-sale-02",
                "actor": manager,
                "customer": customers["Bopha Lim"],
                "items": [
                    {"product": products["TEA-001"], "quantity": Decimal("2.000")},
                    {"product": products["BEV-002"], "quantity": Decimal("3.000")},
                    {"product": products["SNK-002"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("1.50"),
                "payment_method": Sale.PaymentMethod.QR,
                "payment_reference": "KHQR-20261120-001",
                "days_ago": 3,
                "notes": "Loyalty discount applied via KHQR",
            },
            {
                "key": "demo-sale-03",
                "actor": cashier,
                "customer": customers["Rithy Nhem"],
                "items": [
                    {"product": products["BEV-001"], "quantity": Decimal("12.000")},
                    {"product": products["HSH-001"], "quantity": Decimal("3.000")},
                ],
                "discount": Decimal("0.00"),
                "payment_method": Sale.PaymentMethod.CARD,
                "payment_reference": "VISA-8821",
                "days_ago": 2,
                "notes": "Office pantry restock",
            },
            {
                "key": "demo-sale-04",
                "actor": cashier,
                "customer": customers["Channary Heng"],
                "items": [
                    {"product": products["FRU-001"], "quantity": Decimal("2.500")},
                    {"product": products["FRU-002"], "quantity": Decimal("1.500")},
                    {"product": products["DRY-001"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("0.00"),
                "payments": [
                    {"payment_method": Sale.PaymentMethod.CASH, "amount": Decimal("10.00")},
                    {"payment_method": Sale.PaymentMethod.QR, "amount": Decimal("7.65"), "reference_code": "KHQR-SPLIT-04"},
                ],
                "days_ago": 1,
                "notes": "Split payment (Cash + KHQR) grocery basket",
            },
            {
                "key": "demo-sale-05",
                "actor": cashier,
                "customer": customers["Sokha Chan"],
                "items": [
                    {"product": products["COF-002"], "quantity": Decimal("3.000")},
                    {"product": products["SNK-001"], "quantity": Decimal("1.000")},
                    {"product": products["BEV-001"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("0.00"),
                "payment_method": Sale.PaymentMethod.CASH,
                "paid_amount": Decimal("20.00"),
                "days_ago": 0,
                "notes": "Today walk-in coffee order",
            },
            {
                "key": "demo-sale-06",
                "actor": manager,
                "customer": customers["Vichea Meas"],
                "items": [
                    {"product": products["COF-001"], "quantity": Decimal("4.000")},
                    {"product": products["BEV-002"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("1.00"),
                "payment_method": Sale.PaymentMethod.QR,
                "payment_reference": "KHQR-TODAY-06",
                "days_ago": 0,
                "notes": "Today team drinks order",
            },
            {
                "key": "demo-sale-07-void",
                "actor": manager,
                "customer": None,
                "items": [
                    {"product": products["SNK-002"], "quantity": Decimal("2.000")},
                ],
                "discount": Decimal("0.00"),
                "payment_method": Sale.PaymentMethod.CASH,
                "paid_amount": Decimal("5.00"),
                "days_ago": 1,
                "notes": "Duplicate cashier ring-up",
                "post_action": "cancel",
            },
            {
                "key": "demo-sale-08-refund",
                "actor": manager,
                "customer": customers["Bopha Lim"],
                "items": [
                    {"product": products["DRY-001"], "quantity": Decimal("1.000")},
                ],
                "discount": Decimal("0.00"),
                "payment_method": Sale.PaymentMethod.CASH,
                "paid_amount": Decimal("5.00"),
                "days_ago": 0,
                "notes": "Customer returned unopened carton",
                "post_action": "refund",
            },
        ]

        created_sales = 0
        for spec in sale_specs:
            sale, created = checkout_sale(
                actor=spec["actor"],
                customer=spec["customer"],
                items=spec["items"],
                discount_amount=spec["discount"],
                payments=spec.get("payments"),
                payment_method=spec.get("payment_method"),
                paid_amount=spec.get("paid_amount"),
                payment_reference=spec.get("payment_reference", ""),
                notes=spec["notes"],
                idempotency_key=spec["key"],
            )
            if created:
                created_sales += 1
                if spec["days_ago"] > 0:
                    Sale.objects.filter(pk=sale.pk).update(
                        created_at=now - timedelta(days=spec["days_ago"])
                    )
                if spec.get("post_action") == "cancel":
                    cancel_sale(actor=manager, sale=sale, reason="Duplicate test transaction voided")
                elif spec.get("post_action") == "refund":
                    refund_sale(actor=manager, sale=sale, reason="Customer returned item unopened")

        # 10. Expense Categories & Operating Expenses
        exp_cat_specs = [
            ("Store Rent", "ថ្លៃជួលហាង", "Monthly retail space lease"),
            ("Electricity & Water", "ភ្លើង និង ទឹក", "EDC electricity and PPWSA water bills"),
            ("Staff Salaries", "ប្រាក់ខែបុគ្គលិក", "Monthly cashier and store staff payroll"),
            ("Packaging & Supplies", "សម្ភារៈវេចខ្ចប់", "Cups, straws, bags, and receipt thermal rolls"),
        ]
        exp_cats = {}
        for name, name_km, desc in exp_cat_specs:
            cat = ExpenseCategory.objects.filter(name__iexact=name).first()
            if cat is None:
                cat = create_expense_category(
                    actor=admin,
                    name=name,
                    name_km=name_km,
                    description=desc,
                )
            exp_cats[name] = cat

        expense_specs = [
            ("EXP-DEMO-RENT", "Store Rent", "Monthly Shop Lease", Decimal("350.00"), today.replace(day=1), Expense.PaymentMethod.BANK_TRANSFER, "Phnom Penh Property Co."),
            ("EXP-DEMO-EDC", "Electricity & Water", "EDC Electricity Bill", Decimal("82.50"), today - timedelta(days=3), Expense.PaymentMethod.QR, "EDC Cambodia"),
            ("EXP-DEMO-PKG", "Packaging & Supplies", "Thermal Paper & Takeaway Cups", Decimal("28.75"), today - timedelta(days=2), Expense.PaymentMethod.CASH, "Central Market Packaging"),
            ("EXP-DEMO-NET", "Electricity & Water", "Fiber Internet Subscription", Decimal("35.00"), today - timedelta(days=1), Expense.PaymentMethod.BANK_TRANSFER, "MekongNet ISP"),
            ("EXP-DEMO-CLN", "Packaging & Supplies", "Cleaning Detergents & Napkins", Decimal("16.40"), today, Expense.PaymentMethod.CASH, "Local Mart"),
        ]
        created_expenses = 0
        for ref_code, cat_name, title, amount, exp_date, method, vendor in expense_specs:
            if not Expense.objects.filter(reference_code=ref_code).exists():
                create_expense(
                    actor=manager,
                    category=exp_cats[cat_name],
                    title=title,
                    amount=amount,
                    expense_date=exp_date,
                    payment_method=method,
                    reference_code=ref_code,
                    vendor_name=vendor,
                    notes="Demo operating expense entry",
                )
                created_expenses += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Demo POS data ready!\n"
                f"  Users total: {User.objects.count()} (+{created_users} new)\n"
                f"  Categories: {Category.objects.count()} | Units: {Unit.objects.count()} | Products: {Product.objects.count()}\n"
                f"  Suppliers: {Supplier.objects.count()} | Purchases: {Purchase.objects.count()}\n"
                f"  Customers: {Customer.objects.count()} | Sales: {Sale.objects.count()} (+{created_sales} new)\n"
                f"  Expense Categories: {ExpenseCategory.objects.count()} | Expenses: {Expense.objects.count()} (+{created_expenses} new)\n"
                f"  Stock Movements: {StockMovement.objects.count()}"
            )
        )
