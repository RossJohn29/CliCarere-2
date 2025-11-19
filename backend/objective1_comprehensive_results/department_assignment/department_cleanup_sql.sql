
-- Clean up department assignment test patients
DELETE FROM queue WHERE visit_id IN (
    SELECT visit_id FROM visit WHERE patient_id IN (
        SELECT id FROM outpatient WHERE name LIKE '%Dept Test Patient%'
    )
);

DELETE FROM visit WHERE patient_id IN (
    SELECT id FROM outpatient WHERE name LIKE '%Dept Test Patient%'
);

DELETE FROM emergency_contact WHERE patient_id IN (
    SELECT id FROM outpatient WHERE name LIKE '%Dept Test Patient%'
);

DELETE FROM outpatient WHERE name LIKE '%Dept Test Patient%';
