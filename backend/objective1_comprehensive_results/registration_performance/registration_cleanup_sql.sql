
    -- Clean up registration test patients
    DELETE FROM queue WHERE visit_id IN (
        SELECT visit_id FROM visit WHERE patient_id IN (
            SELECT id FROM outpatient WHERE name LIKE '%Web Test Patient%' 
            OR name LIKE '%Kiosk Test Patient%'
            OR name LIKE '%QR Test Patient%'
        )
    );
    
    DELETE FROM visit WHERE patient_id IN (
        SELECT id FROM outpatient WHERE name LIKE '%Web Test Patient%' 
        OR name LIKE '%Kiosk Test Patient%'
        OR name LIKE '%QR Test Patient%'
    );
    
    DELETE FROM emergency_contact WHERE patient_id IN (
        SELECT id FROM outpatient WHERE name LIKE '%Web Test Patient%' 
        OR name LIKE '%Kiosk Test Patient%'
        OR name LIKE '%QR Test Patient%'
    );
    
    DELETE FROM outpatient WHERE name LIKE '%Web Test Patient%' 
    OR name LIKE '%Kiosk Test Patient%'
    OR name LIKE '%QR Test Patient%';
    
    -- Clean up temporary registrations
    DELETE FROM pre_registration WHERE name LIKE '%Web Test Patient%'
    OR name LIKE '%Kiosk Test Patient%'
    OR name LIKE '%QR Test Patient%';
    