const puppeteer = require('puppeteer');
const printer = require('pdf-to-printer');
const fs = require('fs');
const path = require('path');

class PrintServer {
  constructor() {
    this.printQueue = [];
    this.isProcessing = false;
    this.browser = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('✅ Print server browser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize print server:', error);
      throw error;
    }
  }

  async getAvailablePrinters() {
    try {
      const printers = await printer.getPrinters();
      return printers;
    } catch (error) {
      console.error('❌ Failed to get printers:', error);
      return [];
    }
  }

  async generatePDF(htmlContent, outputPath) {
    try {
      if (!this.browser) {
        await this.initialize();
      }

      const page = await this.browser.newPage();
      
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });

      await page.pdf({
        path: outputPath,
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.75in',
          right: '0.75in',
          bottom: '0.75in',
          left: '0.75in'
        }
      });

      await page.close();
      console.log('✅ PDF generated:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      throw error;
    }
  }

  async printPDF(pdfPath, printerName = null) {
    try {
      const options = printerName ? { printer: printerName } : {};
      
      await printer.print(pdfPath, options);
      console.log('✅ Printed successfully:', pdfPath);
      
      setTimeout(() => {
        fs.unlinkSync(pdfPath);
        console.log('🗑️ Cleaned up:', pdfPath);
      }, 5000);
      
      return true;
    } catch (error) {
      console.error('❌ Printing failed:', error);
      throw error;
    }
  }

  async printPatientGuidance(registrationData, patientData, navigationSteps, floorPlanImage, queueColor = 'Gray') {
    try {
      const htmlContent = this.generateGuidanceHTML(
        registrationData, 
        patientData, 
        navigationSteps, 
        floorPlanImage,
        queueColor
      );

      const timestamp = Date.now();
      const pdfPath = path.join(__dirname, 'temp', `guidance_${timestamp}.pdf`);
      
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      await this.generatePDF(htmlContent, pdfPath);
      await this.printPDF(pdfPath);

      return {
        success: true,
        message: 'Document printed successfully'
      };
    } catch (error) {
      console.error('❌ Print guidance failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateGuidanceHTML(registrationData, patientData, navigationSteps, floorPlanImage, queueColor = 'Gray') {
    const issueDate = new Date();
    const formattedDate = issueDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = issueDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });

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
    const department = registrationData.recommendedDepartment || 'Unknown Department';

    return `
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
          
          .symptoms-list {
            padding-left: 8pt;
            line-height: 1.8;
          }
          
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
                    <div class="field-value" style="font-weight: bold; font-size: 14pt; letter-spacing: 1pt;">${registrationData.patientId}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Full Name</div>
                    <div class="field-value">${patientData.fullName || patientData.name || '-'}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Age / Gender</div>
                    <div class="field-value">${patientData.age || '-'} / ${patientData.sex || '-'}</div>
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
                      <span class="color-badge">${registrationData.queue_number || 'N/A'}</span>
                    </div>
                  </div>
                  <div class="field">
                    <div class="field-label">Estimated Wait</div>
                    <div class="field-value">${registrationData.estimated_wait || '15-30 minutes'}</div>
                  </div>
                </div>
              </div>
              <div class="two-col" style="margin-top: 8pt;">
                <div class="col">
                  <div class="field">
                    <div class="field-label">Contact Number</div>
                    <div class="field-value">${patientData.contactNumber || patientData.contact_no || '-'}</div>
                  </div>
                </div>
                <div class="col">
                  <div class="field">
                    <div class="field-label">Email Address</div>
                    <div class="field-value">${patientData.email || '-'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-header">Medical Information</div>
              <div class="field">
                <div class="field-label">Reported Symptoms</div>
                <div class="field-value symptoms-list">
                  ${(patientData.selectedSymptoms || []).join(', ') || 'None reported'}
                </div>
              </div>
              <div class="two-col">
                <div class="col">
                  <div class="field">
                    <div class="field-label">Duration</div>
                    <div class="field-value">${patientData.duration || '-'}</div>
                  </div>
                </div>
                <div class="col">
                  <div class="field">
                    <div class="field-label">Severity</div>
                    <div class="field-value">${patientData.severity || '-'}</div>
                  </div>
                </div>
              </div>
              <div class="two-col" style="margin-top: 8pt;">
                <div class="col">
                  <div class="field">
                    <div class="field-label">⚠ Known Allergies</div>
                    <div class="field-value" style="font-weight: bold;">${patientData.allergies || 'None'}</div>
                  </div>
                </div>
                <div class="col">
                  <div class="field">
                    <div class="field-label">Current Medications</div>
                    <div class="field-value">${patientData.medications || 'None'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            ${(patientData.allergies && patientData.allergies !== 'None') || (patientData.medications && patientData.medications !== 'None') ? `
            <div class="alert-box">
              <div class="alert-header">⚠ Medical Alert</div>
              <div class="alert-content">
                ${patientData.allergies && patientData.allergies !== 'None' ? `
                <div class="alert-item">
                  <strong>Known Allergies:</strong> ${patientData.allergies}
                </div>
                ` : ''}
                ${patientData.medications && patientData.medications !== 'None' ? `
                <div class="alert-item">
                  <strong>Current Medications:</strong> ${patientData.medications}
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
              ${navigationSteps && navigationSteps.length > 0 ? `
              <div class="nav-steps">
                ${navigationSteps.map((step, index) => `
                <div class="nav-step">
                  <div class="step-number">${index + 1}.</div>
                  <div class="step-content">
                    <div class="step-location">${step.location || step.location_name || '-'}</div>
                    <div>${step.description || '-'}</div>
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
  }

  generateVisitId() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DOC${timestamp}${random}`;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Print server browser closed');
    }
  }
}

const printServer = new PrintServer();

module.exports = printServer;