create table if not exists users (
    id serial primary key,
    username text not null unique,
    balance numeric(12,2) not null default 0
);

create table if not exists products (
    id serial primary key,
    name text not null,
    price numeric(12,2) not null
);

create table if not exists purchases (
    id serial primary key,
    user_id integer not null references users(id),
    product_id integer not null references products(id),
    price_paid numeric(12,2) not null,
    created_at timestamptz not null default now()
);

insert into users (username, balance) values
    ('demo_user', 150.00),
    ('collector', 75.50)
on conflict do nothing;

insert into products (name, price) values
    ('Emerald Karambit Replica', 49.99),
    ('Dragon Sticker Pack', 12.45),
    ('Titanium Gloves', 89.50)
on conflict do nothing;
