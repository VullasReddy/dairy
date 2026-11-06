CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 078c23715cd9

CREATE TABLE admin_permissions (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    code VARCHAR(60) NOT NULL, 
    module VARCHAR(40) NOT NULL, 
    name VARCHAR(120) NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (code)
);

CREATE INDEX ix_admin_permissions_module ON admin_permissions (module);

CREATE TABLE admin_roles (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    name VARCHAR(50) NOT NULL, 
    description VARCHAR(200), 
    is_super BOOL, 
    PRIMARY KEY (id), 
    UNIQUE (name)
);

CREATE TABLE blog_posts (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    slug VARCHAR(120) NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    excerpt VARCHAR(300), 
    body TEXT, 
    cover_image VARCHAR(255), 
    author VARCHAR(100), 
    is_published BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    UNIQUE (slug)
);

CREATE TABLE products (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    slug VARCHAR(60) NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    tagline VARCHAR(150), 
    description TEXT, 
    image VARCHAR(255), 
    nutrition JSON, 
    is_active BOOL, 
    sort_order INTEGER, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    UNIQUE (slug)
);

CREATE TABLE quality_reports (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    title VARCHAR(150) NOT NULL, 
    report_type VARCHAR(50), 
    issued_by VARCHAR(150), 
    report_date DATE, 
    file_url VARCHAR(255), 
    summary TEXT, 
    is_published BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id)
);

CREATE TABLE serviceable_areas (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    pincode VARCHAR(6) NOT NULL, 
    area VARCHAR(100), 
    is_active BOOL, 
    PRIMARY KEY (id), 
    UNIQUE (pincode)
);

CREATE TABLE subscription_plans (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    code VARCHAR(30) NOT NULL, 
    name VARCHAR(60) NOT NULL, 
    duration_days INTEGER NOT NULL, 
    discount_percent NUMERIC(5, 2), 
    is_trial BOOL, 
    trial_max_packets INTEGER, 
    display_price NUMERIC(10, 2), 
    is_popular BOOL, 
    is_active BOOL, 
    sort_order INTEGER, 
    description VARCHAR(255), 
    PRIMARY KEY (id), 
    UNIQUE (code)
);

CREATE TABLE website_content (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    `key` VARCHAR(60) NOT NULL, 
    value JSON, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    UNIQUE (`key`)
);

CREATE TABLE product_variants (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    product_id INTEGER NOT NULL, 
    size_ml INTEGER NOT NULL, 
    label VARCHAR(30), 
    price NUMERIC(10, 2) NOT NULL, 
    mrp NUMERIC(10, 2), 
    stock_litres NUMERIC(10, 2), 
    low_stock_litres NUMERIC(10, 2), 
    is_available BOOL, 
    trial_eligible BOOL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL, 
    permission_id INTEGER NOT NULL, 
    PRIMARY KEY (role_id, permission_id), 
    FOREIGN KEY(permission_id) REFERENCES admin_permissions (id) ON DELETE CASCADE, 
    FOREIGN KEY(role_id) REFERENCES admin_roles (id) ON DELETE CASCADE
);

CREATE TABLE users (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    email VARCHAR(120) NOT NULL, 
    phone VARCHAR(15), 
    password_hash VARCHAR(255) NOT NULL, 
    `role` VARCHAR(20) NOT NULL, 
    admin_role_id INTEGER, 
    is_active BOOL, 
    email_verified BOOL, 
    verify_token VARCHAR(64), 
    reset_token VARCHAR(64), 
    reset_expires DATETIME, 
    trial_used BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(admin_role_id) REFERENCES admin_roles (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE INDEX ix_users_phone ON users (phone);

CREATE TABLE addresses (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    label VARCHAR(30), 
    line1 VARCHAR(200) NOT NULL, 
    line2 VARCHAR(200), 
    landmark VARCHAR(120), 
    area VARCHAR(100), 
    city VARCHAR(80), 
    pincode VARCHAR(6) NOT NULL, 
    instructions VARCHAR(255), 
    is_default BOOL, 
    is_deleted BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_addresses_pincode ON addresses (pincode);

CREATE TABLE audit_logs (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER, 
    entity VARCHAR(40) NOT NULL, 
    entity_id INTEGER, 
    action VARCHAR(60) NOT NULL, 
    details JSON, 
    created_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);

CREATE TABLE contact_enquiries (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER, 
    name VARCHAR(100) NOT NULL, 
    email VARCHAR(120), 
    phone VARCHAR(15), 
    kind VARCHAR(20), 
    subject VARCHAR(150), 
    message TEXT NOT NULL, 
    status VARCHAR(20), 
    admin_reply TEXT, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE customer_profiles (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    full_name VARCHAR(120) NOT NULL, 
    alt_phone VARCHAR(15), 
    preferred_time VARCHAR(30), 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id), 
    UNIQUE (user_id)
);

CREATE TABLE delivery_staff (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER, 
    name VARCHAR(100) NOT NULL, 
    phone VARCHAR(15) NOT NULL, 
    vehicle VARCHAR(50), 
    is_active BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id), 
    UNIQUE (user_id)
);

CREATE TABLE notifications (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER, 
    audience VARCHAR(10), 
    title VARCHAR(150) NOT NULL, 
    message TEXT, 
    kind VARCHAR(30), 
    is_read BOOL, 
    created_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_notifications_user_id ON notifications (user_id);

CREATE TABLE reviews (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER, 
    name VARCHAR(100) NOT NULL, 
    avatar VARCHAR(255), 
    rating INTEGER, 
    comment TEXT NOT NULL, 
    is_approved BOOL, 
    is_featured BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE delivery_routes (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    name VARCHAR(80) NOT NULL, 
    area VARCHAR(100), 
    pincodes JSON, 
    default_staff_id INTEGER, 
    is_active BOOL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(default_staff_id) REFERENCES delivery_staff (id)
);

CREATE TABLE orders (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    order_number VARCHAR(30) NOT NULL, 
    user_id INTEGER NOT NULL, 
    address_id INTEGER, 
    plan_id INTEGER, 
    subtotal NUMERIC(10, 2), 
    discount NUMERIC(10, 2), 
    total NUMERIC(10, 2), 
    status VARCHAR(20), 
    idempotency_key VARCHAR(64), 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(address_id) REFERENCES addresses (id), 
    FOREIGN KEY(plan_id) REFERENCES subscription_plans (id), 
    FOREIGN KEY(user_id) REFERENCES users (id), 
    UNIQUE (idempotency_key), 
    UNIQUE (order_number)
);

CREATE TABLE order_items (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    order_id INTEGER NOT NULL, 
    variant_id INTEGER NOT NULL, 
    daily_qty INTEGER NOT NULL, 
    unit_price NUMERIC(10, 2) NOT NULL, 
    days INTEGER NOT NULL, 
    line_total NUMERIC(10, 2) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(order_id) REFERENCES orders (id), 
    FOREIGN KEY(variant_id) REFERENCES product_variants (id)
);

CREATE TABLE payments (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    order_id INTEGER NOT NULL, 
    user_id INTEGER NOT NULL, 
    provider VARCHAR(20), 
    provider_order_id VARCHAR(80), 
    provider_payment_id VARCHAR(80), 
    amount NUMERIC(10, 2) NOT NULL, 
    currency VARCHAR(5), 
    method VARCHAR(30), 
    status VARCHAR(20), 
    failure_reason VARCHAR(255), 
    refund_amount NUMERIC(10, 2), 
    refund_note VARCHAR(255), 
    receipt_number VARCHAR(30), 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(order_id) REFERENCES orders (id), 
    FOREIGN KEY(user_id) REFERENCES users (id), 
    UNIQUE (provider_payment_id)
);

CREATE UNIQUE INDEX ix_payments_provider_order_id ON payments (provider_order_id);

CREATE TABLE subscriptions (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    user_id INTEGER NOT NULL, 
    order_id INTEGER, 
    plan_id INTEGER NOT NULL, 
    address_id INTEGER NOT NULL, 
    start_date DATE NOT NULL, 
    end_date DATE NOT NULL, 
    status VARCHAR(20), 
    paused_from DATE, 
    total_amount NUMERIC(10, 2), 
    is_trial BOOL, 
    cancel_reason VARCHAR(255), 
    refund_due NUMERIC(10, 2), 
    reminder_sent BOOL, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(address_id) REFERENCES addresses (id), 
    FOREIGN KEY(order_id) REFERENCES orders (id), 
    FOREIGN KEY(plan_id) REFERENCES subscription_plans (id), 
    FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_subscriptions_status ON subscriptions (status);

CREATE INDEX ix_subscriptions_user_id ON subscriptions (user_id);

CREATE TABLE delivery_schedule (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    subscription_id INTEGER NOT NULL, 
    delivery_date DATE NOT NULL, 
    staff_id INTEGER, 
    route_id INTEGER, 
    status VARCHAR(20), 
    items_snapshot JSON, 
    note VARCHAR(255), 
    delivered_at DATETIME, 
    created_at DATETIME NOT NULL, 
    updated_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(route_id) REFERENCES delivery_routes (id), 
    FOREIGN KEY(staff_id) REFERENCES delivery_staff (id), 
    FOREIGN KEY(subscription_id) REFERENCES subscriptions (id), 
    UNIQUE (subscription_id, delivery_date)
);

CREATE INDEX ix_delivery_schedule_delivery_date ON delivery_schedule (delivery_date);

CREATE INDEX ix_delivery_schedule_status ON delivery_schedule (status);

CREATE INDEX ix_delivery_schedule_subscription_id ON delivery_schedule (subscription_id);

CREATE TABLE subscription_items (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    subscription_id INTEGER NOT NULL, 
    variant_id INTEGER NOT NULL, 
    daily_qty INTEGER NOT NULL, 
    unit_price NUMERIC(10, 2) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(subscription_id) REFERENCES subscriptions (id), 
    FOREIGN KEY(variant_id) REFERENCES product_variants (id)
);

CREATE TABLE subscription_skips (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    subscription_id INTEGER NOT NULL, 
    skip_date DATE NOT NULL, 
    status VARCHAR(12) NOT NULL, 
    reason VARCHAR(255), 
    created_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(subscription_id) REFERENCES subscriptions (id), 
    UNIQUE (subscription_id, skip_date)
);

CREATE TABLE delivery_tracking (
    id INTEGER NOT NULL AUTO_INCREMENT, 
    schedule_id INTEGER NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    note VARCHAR(255), 
    proof_image VARCHAR(255), 
    changed_by INTEGER, 
    created_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(changed_by) REFERENCES users (id), 
    FOREIGN KEY(schedule_id) REFERENCES delivery_schedule (id)
);

INSERT INTO alembic_version (version_num) VALUES ('078c23715cd9');

