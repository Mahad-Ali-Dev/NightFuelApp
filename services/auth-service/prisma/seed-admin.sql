-- Seed the FIRST admin.
--
-- ADMIN is never self-assignable (registration always creates a USER — see
-- src/schemas.ts + auth.service.register), so the very first admin must be
-- promoted out-of-band, here. The account must already exist (register it in the
-- app first), then run this against the auth DB on the VPS:
--
--   docker exec -i docker-postgres-1 psql -U postgres -d nightfuel_auth \
--     -v admin_email="'you@example.com'" -f - < seed-admin.sql
--
-- Or inline (substitute the real email):
--   docker exec docker-postgres-1 psql -U postgres -d nightfuel_auth \
--     -c "UPDATE users SET role='ADMIN' WHERE email='you@example.com';"
--
-- Verify:
--   docker exec docker-postgres-1 psql -U postgres -d nightfuel_auth \
--     -c "SELECT email, role FROM users WHERE role='ADMIN';"

UPDATE users SET role = 'ADMIN' WHERE email = :admin_email;
