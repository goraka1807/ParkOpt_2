-- Check for remaining demo parking spaces
SELECT id, name
FROM public.parking_spaces
WHERE name ILIKE 'Demo Parking -%';

-- Check for bookings linked to the five demo spaces
SELECT id, space_id, status
FROM public.bookings
WHERE space_id IN (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005'
);