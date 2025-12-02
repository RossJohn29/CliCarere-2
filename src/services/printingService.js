// printingService.js
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
export class PrintingService {
  
  static async isPrintServerAvailable() {
    try {
      const response = await fetch(`${API_URL}/api/print/printers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.ok;
    } catch (error) {
      console.warn('⚠️ Print server not available:', error.message);
      return false;
    }
  }
  static async fetchFloorPlanImageFromDatabase(department) {
    try {
      const deptResponse = await fetch(`${API_URL}/api/department-by-name/${encodeURIComponent(department)}`);
      
      if (!deptResponse.ok) {
        console.warn(`⚠️ Could not find department "${department}" in database`);
        return null;
      }
      const deptResult = await deptResponse.json();
      
      if (!deptResult.success || !deptResult.department) {
        console.warn(`⚠️ No department data found for "${department}"`);
        return null;
      }
      if (!deptResult.department.floor_plan_image) {
        console.warn(`⚠️ No floor plan image configured for department "${department}"`);
        return null;
      }
      const floorPlanUrl = deptResult.department.floor_plan_image;
      console.log(`✅ Successfully fetched floor plan URL for ${department}:`, floorPlanUrl);
      return floorPlanUrl;
      
    } catch (err) {
      console.error('❌ Error fetching floor plan from database:', err.message);
      return null;
    }
  }
  static async generateNavigationSteps(department) {
    try {
      const response = await fetch(`${API_URL}/api/navigation-steps-by-name/${encodeURIComponent(department)}`);
      const result = await response.json();
      
      if (!result.success || !result.steps || result.steps.length === 0) {
        console.warn(`⚠️ No navigation steps found for department "${department}"`);
        return [];
      }
      
      console.log(`✅ Successfully fetched ${result.steps.length} navigation steps for ${department}`);
      return result.steps.map(step => ({
        location: step.location_name,
        description: step.description,
        floor: step.floor_number,
        rooms: step.room_numbers
      }));
      
    } catch (error) {
      console.error('❌ Navigation steps API failed:', error.message);
      return [];
    }
  }
  
  static generateQueueNumber() {
    return Math.floor(Math.random() * 50) + 1;
  }
  
  static generateVisitId() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DOC${timestamp}${random}`;
  }
  static async generatePatientGuidancePacket(registrationResult, patientData, formData) {
    try {
      console.log('🖨️ Starting print job...');
      
      const currentData = patientData || formData || {};
      const department = registrationResult.recommendedDepartment || 'Unknown Department';
      
      const printServerAvailable = await this.isPrintServerAvailable();
      
      if (printServerAvailable) {
        console.log('✅ Print server available - using server-side printing');
        return await this.printViaServer(registrationResult, currentData, department);
      } else {
        console.log('⚠️ Print server unavailable - using browser fallback');
        return await this.printViaBrowser(registrationResult, currentData, department);
      }
      
    } catch (error) {
      console.error('❌ Print job failed:', error);
      this.handlePrintError(error);
      return false;
    }
  }
  static async printViaServer(registrationResult, patientData, department) {
    try {
      console.log('📤 Sending print job to server...');
      
      const navigationSteps = await this.generateNavigationSteps(department);
      const floorPlanImage = await this.fetchFloorPlanImageFromDatabase(department);
      
      console.log('📍 Navigation steps:', navigationSteps.length);
      console.log('🗺️ Floor plan:', floorPlanImage ? 'Found' : 'Not found');
      const response = await fetch(`${API_URL}/api/print/guidance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationData: registrationResult,
          patientData: patientData,
          navigationSteps: navigationSteps,
          floorPlanImage: floorPlanImage
        })
      });
      const result = await response.json();
      if (result.success) {
        console.log('✅ Print job sent to printer successfully!');
        console.log('📄 Document is printing automatically (no dialog)');
        return true;
      } else {
        throw new Error(result.error || 'Print server returned error');
      }
    } catch (error) {
      console.error('❌ Server printing failed:', error);
      console.log('🔄 Falling back to browser print...');
      return await this.printViaBrowser(registrationResult, patientData, department);
    }
  }
  static async printViaBrowser(registrationResult, patientData, department) {
    try {
      console.log('🌐 Using browser-based printing (will show dialog)...');
      
      const currentData = patientData;
      
      console.log('🔍 Fetching navigation steps and floor plan...');
      const navigationSteps = await this.generateNavigationSteps(department);
      const floorPlanImage = await this.fetchFloorPlanImageFromDatabase(department);
      
      const deptResponse = await fetch(`${API_URL}/api/department-by-name/${encodeURIComponent(department)}`);
      let queueColor = 'Gray'; // Default
      
      if (deptResponse.ok) {
        const deptResult = await deptResponse.json();
        if (deptResult.success && deptResult.department.queue_color) {
          queueColor = deptResult.department.queue_color;
        }
      }
      
      console.log('🎨 Queue color for department:', queueColor);
      console.log('✅ Data fetched successfully');
      console.log('📍 Navigation steps:', navigationSteps.length);
      console.log('🗺️ Floor plan:', floorPlanImage ? 'Found' : 'Not found');
      const issueDate = new Date();
      const formattedDate = issueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const formattedTime = issueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      const queueColorMap = {
        'Gray': '#6b7280',
        'Red': '#dc2626',
        'Blue': '#2563eb',
        'Green': '#16a34a',
        'Yellow': '#eab308',
        'Purple': '#9333ea',
        'Pink': '#ec4899',
        'Orange': '#ea580c',
        'White': '#f8fafc',
        'Cyan': '#06b6d4',
        'Light Blue': '#38bdf8',
        'Maroon': '#7f1d1d',
        'Brown': '#92400e',
        'Teal': '#0d9488',
        'Navy': '#1e3a8a',
        'Lime': '#65a30d',
        'Olive': '#84cc16',
        'Violet': '#7c3aed',
        'Coral': '#f97316',
        'Sky Blue': '#0ea5e9',
        'Indigo': '#4f46e5',
        'Magenta': '#d946ef',
        'Crimson': '#dc2626',
        'Silver': '#94a3b8',
        'Gold': '#f59e0b',
        'Bronze': '#a16207',
        'Copper': '#ea580c',
        'Peach': '#fb923c',
        'Turquoise': '#14b8a6',
        'Beige': '#d6d3d1',
        'Lavender': '#a78bfa'
      };
      
      const queueColorBg = queueColorMap[queueColor] || '#6b7280';
      const queueColorText = (queueColor === 'White' || queueColor === 'Beige' || queueColor === 'Silver') ? '#000000' : '#ffffff';
      
      console.log('📄 Creating print iframe...');
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
      const printDoc = printFrame.contentWindow.document;
      
      const printContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>CliCare — Patient Guidance Packet</title>
          <style>
            @page {
              size: letter;
              margin: 0.75in;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            html, body {
              height: 100%;
              font-family: 'Times New Roman', Times, serif;
              background: #f5f5f5;
              color: #000;
              font-size: 11pt;
              line-height: 1.4;
            }
            
            .page-container {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            
            .document {
              width: 8.5in;
              min-height: 11in;
              background: white;
              padding: 0.75in;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              position: relative;
            }
            
            /* Header */
            .header {
              padding-bottom: 12pt;
              margin-bottom: 16pt;
              display: flex;
              align-items: center;
              gap: 16pt;
            }
            
            .logo-container {
              width: 70pt;
              height: 70pt;
              flex-shrink: 0;
            }
            
            .logo-container img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            
            .header-text {
              flex: 1;
            }
            
            .hospital-name {
              font-size: 16pt;
              font-weight: bold;
              letter-spacing: 0.5pt;
              margin-bottom: 4pt;
            }
            
            .document-title {
              font-size: 11pt;
              font-weight: bold;
              margin-bottom: 2pt;
            }
            
            .document-date {
              font-size: 9pt;
              color: #333;
            }
            
            .doc-number {
              text-align: right;
              font-size: 9pt;
            }
            
            .doc-number-label {
              color: #666;
            }
            
            .doc-number-value {
              font-weight: bold;
              font-size: 10pt;
              letter-spacing: 0.5pt;
            }
            
            /* Patient ID Box */
            .patient-id-box {
              border: 2pt solid #000;
              padding: 10pt;
              margin-bottom: 14pt;
              text-align: center;
              background: #f9f9f9;
            }
            
            .patient-id-label {
              font-size: 9pt;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1pt;
              margin-bottom: 4pt;
            }
            
            .patient-id-value {
              font-size: 14pt;
              font-weight: bold;
              letter-spacing: 2pt;
              font-family: 'Courier New', monospace;
            }
            
            /* Section Headers */
            .section {
              margin-bottom: 14pt;
            }
            
            .section-header {
              font-size: 11pt;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1pt;
              border-bottom: 1.5pt solid #000;
              padding-bottom: 3pt;
              margin-bottom: 8pt;
            }
            
            /* Two Column Layout */
            .two-col {
              display: flex;
              gap: 20pt;
              margin-bottom: 8pt;
            }
            
            .col {
              flex: 1;
            }
            
            .field {
              margin-bottom: 8pt;
            }
            
            .field-label {
              font-weight: bold;
              font-size: 9pt;
              text-transform: uppercase;
              letter-spacing: 0.3pt;
              margin-bottom: 2pt;
            }
            
            .field-value {
              font-size: 11pt;
              padding-left: 8pt;
            }
            
            /* Queue Information */
            .queue-info {
              display: flex;
              gap: 24pt;
              padding: 10pt 0;
              border-top: 1pt solid #ccc;
              border-bottom: 1pt solid #ccc;
              margin-bottom: 14pt;
            }
            
            .queue-item {
              flex: 1;
              text-align: center;
            }
            
            .queue-label {
              font-size: 8pt;
              text-transform: uppercase;
              letter-spacing: 0.5pt;
              font-weight: bold;
              margin-bottom: 4pt;
            }
            
            .queue-value {
              font-size: 11pt;
              font-weight: bold;
            }
            
            .queue-number {
              font-size: 16pt;
            }
            
            .color-badge {
              display: inline-block;
              background: ${queueColorBg};
              color: ${queueColorText};
              padding: 6pt 14pt;
              font-size: 16pt;
              font-weight: bold;
              letter-spacing: 1pt;
              border-radius: 2pt;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              ${(queueColor === 'White' || queueColor === 'Beige') ? 'border: 1pt solid #ccc;' : ''}
            }
            
            /* Medical Alert Box */
            .alert-box {
              border: 3pt solid #000;
              padding: 10pt;
              margin: 12pt 0;
              background: #fff;
            }
            
            .alert-header {
              text-align: center;
              font-size: 10pt;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1.5pt;
              margin-bottom: 8pt;
              border-bottom: 1pt solid #000;
              padding-bottom: 4pt;
            }
            
            .alert-content {
              font-size: 10pt;
              line-height: 1.5;
            }
            
            .alert-item {
              margin-bottom: 6pt;
            }
            
            .alert-item strong {
              text-transform: uppercase;
              letter-spacing: 0.3pt;
            }
            
            /* Symptoms */
            .symptoms-list {
              padding-left: 8pt;
              line-height: 1.8;
            }
            
            /* Navigation Instructions */
            .nav-steps {
              padding-left: 8pt;
            }
            
            .nav-step {
              margin-bottom: 8pt;
              display: flex;
              gap: 12pt;
            }
            
            .step-number {
              font-weight: bold;
              font-size: 11pt;
              min-width: 20pt;
            }
            
            .step-content {
              flex: 1;
            }
            
            .step-location {
              font-weight: bold;
              font-style: italic;
            }
            
            .step-details {
              font-size: 9pt;
              color: #333;
              margin-top: 2pt;
            }
            
            /* Emergency Box */
            .emergency-box {
              border: 1pt solid #000;
              padding: 6pt;
              text-align: center;
              background: #f9f9f9;
              margin: 10pt 0;
              font-size: 9pt;
            }
            
            .emergency-box strong {
              font-size: 9pt;
              text-transform: uppercase;
              letter-spacing: 0.5pt;
            }
            
            /* Footer */
            .footer {
              margin-top: 16pt;
              padding-top: 8pt;
              font-size: 8pt;
              text-align: center;
              color: #666;
            }
            
            @media print {
              body {
                background: white;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
              
              .page-container {
                padding: 0;
                display: block;
              }
              
              .document {
                box-shadow: none;
                margin: 0;
                padding: 0.75in;
              }
              
              .color-badge {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="document">
              
              
              <div class="header">
                <div class="logo-container">
                  <img src="logo.png" alt="CliCare Hospital Logo" onerror="this.style.display='none'" />
                </div>
                <div class="header-text">
                  <div class="hospital-name">CLICARE HOSPITAL</div>
                  <div class="document-title">Patient Guidance Packet</div>
                  <div class="document-date">Issued: ${formattedDate} at ${formattedTime}</div>
                </div>
                <div class="doc-number">
                  <div class="doc-number-label">Document No.</div>
                  <div class="doc-number-value">${this.generateVisitId()}</div>
                </div>
              </div>
              
              
              <div class="section">
                <div class="section-header">Patient Information</div>
                <div class="two-col">
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Patient ID</div>
                      <div class="field-value" style="font-weight: bold; font-size: 14pt; letter-spacing: 1pt;">${registrationResult.patientId}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Full Name</div>
                      <div class="field-value">${currentData.fullName || currentData.name || '-'}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Age / Gender</div>
                      <div class="field-value">${currentData.age || '-'} / ${currentData.sex || '-'}</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Department</div>
                      <div class="field-value">${department}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Queue Number</div>
                      <div class="field-value">
                        <span class="color-badge">${registrationResult.queue_number || this.generateQueueNumber()}</span>
                      </div>
                    </div>
                    <div class="field">
                      <div class="field-label">Estimated Wait</div>
                      <div class="field-value">${registrationResult.estimated_wait || '15-30 minutes'}</div>
                    </div>
                  </div>
                </div>
                <div class="two-col" style="margin-top: 8pt;">
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Contact Number</div>
                      <div class="field-value">${currentData.contactNumber || currentData.contact_no || '-'}</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Email Address</div>
                      <div class="field-value">${currentData.email || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              
              <div class="section">
                <div class="section-header">Medical Information</div>
                <div class="field">
                  <div class="field-label">Reported Symptoms</div>
                  <div class="field-value symptoms-list">
                    ${(currentData.selectedSymptoms || []).join(', ') || 'None reported'}
                  </div>
                </div>
                <div class="two-col">
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Duration</div>
                      <div class="field-value">${currentData.duration || '-'}</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Severity</div>
                      <div class="field-value">${currentData.severity || '-'}</div>
                    </div>
                  </div>
                </div>
                <div class="two-col" style="margin-top: 8pt;">
                  <div class="col">
                    <div class="field">
                      <div class="field-label">⚠ Known Allergies</div>
                      <div class="field-value" style="font-weight: bold;">${currentData.allergies || 'None'}</div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="field">
                      <div class="field-label">Current Medications</div>
                      <div class="field-value">${currentData.medications || 'None'}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              ${(currentData.allergies && currentData.allergies !== 'None') || (currentData.medications && currentData.medications !== 'None') ? `
              
              <div class="alert-box">
                <div class="alert-header">⚠ Medical Alert</div>
                <div class="alert-content">
                  ${currentData.allergies && currentData.allergies !== 'None' ? `
                  <div class="alert-item">
                    <strong>Known Allergies:</strong> ${currentData.allergies}
                  </div>
                  ` : ''}
                  ${currentData.medications && currentData.medications !== 'None' ? `
                  <div class="alert-item">
                    <strong>Current Medications:</strong> ${currentData.medications}
                  </div>
                  ` : ''}
                </div>
              </div>
              ` : ''}
              
              ${floorPlanImage ? `
              
              <div class="section">
                <div class="section-header">Department Location Map</div>
                <div style="text-align: center; margin-bottom: 10pt;">
                  <img src="${floorPlanImage}" alt="Hospital Floor Plan" style="max-width: 100%; height: auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                  <div style="display: none; border: 1pt dashed #999; padding: 30pt; background: #fafafa; font-size: 9pt; color: #666;">
                    [Floor Plan Map Image]<br>
                    Please refer to the physical map at reception if image is not visible
                  </div>
                </div>
                <div style="font-size: 9pt; text-align: center; color: #333; font-style: italic;">
                  ${department} Department — Location Map
                </div>
              </div>
              ` : ''}
              
              
              <div class="section">
                <div class="section-header">Navigation Instructions</div>
                ${navigationSteps.length > 0 ? `
                <div class="nav-steps">
                  ${navigationSteps.map((step, index) => `
                  <div class="nav-step">
                    <div class="step-number">${index + 1}.</div>
                    <div class="step-content">
                      <div class="step-location">${step.location}</div>
                      <div>${step.description}</div>
                      <div class="step-details">${step.floor && step.rooms ? `${step.floor} — ${step.rooms}` : step.floor || step.rooms || 'See reception for directions'}</div>
                    </div>
                  </div>
                  `).join('')}
                </div>
                ` : `
                <div style="border: 1pt dashed #999; padding: 20pt; background: #fafafa; font-size: 9pt; color: #666; text-align: center;">
                  Navigation instructions are not yet configured for this department.<br>
                  Please proceed to the main reception desk for directions to ${department}.
                </div>
                `}
              </div>
              
              
              <div class="emergency-box">
                <strong>⚠ Emergency Notice</strong><br>
                In case of medical emergency, proceed immediately to the Emergency Department<br>
                <em>Ground Floor, East Wing</em>
              </div>
              
              
              <div class="footer">
                CliCare - Medical Center & Healthcare Institution<br>
                Reference: ${this.generateVisitId()} | Please retain this document for your visit
              </div>
              
            </div>
          </div>
        </body>
        </html>
      `;
      
      console.log('📝 Writing content to print frame...');
      printDoc.open();
      printDoc.write(printContent);
      printDoc.close();
      console.log('⏳ Waiting for content to load...');
      await new Promise((resolve) => {
        if (floorPlanImage) {
          const img = printDoc.querySelector('img');
          if (img) {
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
              console.log('✅ Floor plan loaded');
              setTimeout(resolve, 1000);
            };
            img.onerror = (e) => {
              console.warn('⚠️ Floor plan failed to load:', e);
              setTimeout(resolve, 500);
            };
            setTimeout(resolve, 5000);
          } else {
            setTimeout(resolve, 500);
          }
        } else {
          setTimeout(resolve, 500);
        }
      });
      console.log('🖨️ Triggering print dialog...');
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
        console.log('✅ Print generation completed!');
      }, 1000);
      
      return true;
      
    } catch (error) {
      console.error('❌ Browser print failed:', error);
      this.handlePrintError(error);
      throw error;
    }
  }
  
  static async printThermalReceipt(registrationResult, patientData, formData) {
    try {
      const currentData = patientData || formData;
      
      const printServerAvailable = await this.isPrintServerAvailable();
      
      if (printServerAvailable) {
        console.log('🖨️ Sending receipt to print server...');
        
        const response = await fetch(`${API_URL}/api/print/receipt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registrationData: registrationResult,
            patientData: currentData
          })
        });
        const result = await response.json();
        if (result.success) {
          console.log('✅ Receipt printed via server!');
          return true;
        }
      }
      
      console.log('🌐 Using browser print for receipt...');
      
      const receiptContent = `
        ================================
        🏥 CLICARE HOSPITAL
        Patient Registration Receipt
        ================================
        
        PATIENT ID: ${registrationResult.patientId}
        
        Name: ${currentData.fullName || currentData.name}
        Age/Sex: ${currentData.age} / ${currentData.sex}
        
        DEPARTMENT: ${registrationResult.recommendedDepartment}
        QUEUE NO: ${registrationResult.queue_number || this.generateQueueNumber()}
        
        SYMPTOMS:
        ${(currentData.selectedSymptoms || []).join(', ')}
        
        NEXT STEPS:
        1. Go to Reception Desk
        2. Present this receipt
        3. Proceed to ${registrationResult.recommendedDepartment}
        4. Wait for queue number
        
        Visit: ${new Date().toLocaleString()}
        ================================
        Keep this receipt for your visit
        ================================
      `;
      
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
      const printDoc = printFrame.contentWindow.document;
      
      printDoc.open();
      printDoc.write(`
        <html>
        <head>
          <title>Receipt</title>
          <style>
            body {
              font-family: monospace;
              white-space: pre-wrap;
              font-size: 12px;
              margin: 20px;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>${receiptContent}</body>
        </html>
      `);
      printDoc.close();
      
      setTimeout(() => {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
        
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 500);
      
      return true;
      
    } catch (error) {
      this.handlePrintError(error);
      return false;
    }
  }
  
  static isPrintingSupported() {
    return typeof window !== 'undefined' && 'print' in window;
  }
  
  static handlePrintError(error) {
    console.error('Printing failed:', error);
    alert('Printing failed: ' + error.message + '\n\nPlease ask hospital staff for assistance or take a screenshot of your information.');
  }
}