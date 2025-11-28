// server.js localhost
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require('nodemailer');
const axios = require('axios');
const QRCode = require('qrcode');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Print server - optional (only for local kiosk)
let printServer;

(async () => {
  try {
    printServer = require('./printServer');
    if (process.env.NODE_ENV !== 'production') {
      await printServer.initialize();
      console.log('✅ Print server initialized successfully');
    } else {
      console.log('ℹ️ Print server loaded but disabled in production');
    }
  } catch (error) {
    console.log('ℹ️ Print server not available (not needed for cloud deployment)');
    printServer = {
      initialize: async () => {},
      getAvailablePrinters: async () => [],
      printPatientGuidance: async () => ({ 
        success: false, 
        error: 'Printing not available in cloud' 
      }),
      cleanup: async () => {}
    };
  }
})();

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// Configuration
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Brevo SMTP Configuration
// ✅ Brevo API Configuration (replaces SMTP)
const brevo = require('@getbrevo/brevo');

let brevoApiInstance = null;
if (process.env.BREVO_API_KEY) {
  brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
  );
  console.log('✅ Brevo API initialized');
} else {
  console.warn('⚠️ BREVO_API_KEY not set - emails will not work');
}

const emailConfig = {
  from: {
    email: process.env.EMAIL_FROM || 'input.raw2x@gmail.com',
    name: 'CliCare Hospital'
  }
};

console.log('📧 Email Configuration:', {
  provider: 'Brevo API',
  from: emailConfig.from.email,
  apiConfigured: !!process.env.BREVO_API_KEY
});


const TEXTBEE_CONFIG = {
  apiKey: process.env.TEXTBEE_API_KEY,
  deviceId: process.env.TEXTBEE_DEVICE_ID,
  apiUrl: 'https://api.textbee.dev/api/v1'
};

const isSMSConfigured = TEXTBEE_CONFIG.apiKey && TEXTBEE_CONFIG.apiKey !== 'PR-SAMPL123456_ABCDE';

// In-Memory Store for Rate Limiting
const failedAttempts = new Map();

// Rate Limiting Functions
const checkAccountRateLimit = (identifier) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  if (!failedAttempts.has(identifier)) {
    failedAttempts.set(identifier, []);
  }

  const attempts = failedAttempts.get(identifier);
  const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
  failedAttempts.set(identifier, recentAttempts);

  if (recentAttempts.length >= maxAttempts) {
    const oldestAttempt = Math.min(...recentAttempts);
    const timeLeft = windowMs - (now - oldestAttempt);
    const minutesLeft = Math.ceil(timeLeft / 60000);
    
    throw new Error(`Too many failed login attempts for this account. Try again in ${minutesLeft} minutes.`);
  }
};

const recordFailedAttempt = (identifier) => {
  if (!failedAttempts.has(identifier)) {
    failedAttempts.set(identifier, []);
  }
  
  const attempts = failedAttempts.get(identifier);
  attempts.push(Date.now());
  failedAttempts.set(identifier, attempts);
};

const clearFailedAttempts = (identifier) => {
  failedAttempts.delete(identifier);
};

// Utility Functions
const generateOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const assignDepartmentBySymptoms = async (symptoms, patientAge = null) => {
  try {
    const { data: mappings, error } = await supabase
      .from('symptom_department')
      .select('symptom_name, department_id, priority, age_min, age_max')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error fetching symptom mappings:', error);
      return 2; // Fallback to Internal Medicine
    }

    // Find best matching department
    for (const symptom of symptoms) {
      const matches = mappings.filter(mapping => 
        mapping.symptom_name === symptom &&
        (patientAge === null || 
        (patientAge >= mapping.age_min && patientAge <= mapping.age_max))
      );
      
      if (matches.length > 0) {
        return matches[0].department_id;
      }
    }
    
    return 2; // Default to Internal Medicine
  } catch (error) {
    console.error('Error in symptom mapping:', error);
    return 2; // Fallback to Internal Medicine
  }
};

const calculateNextAvailableDate = async (departmentId) => {
  try {
    const { data: department, error } = await supabase
      .from('department')
      .select('is_scheduled, available_days, service_type, name')
      .eq('department_id', departmentId)
      .single();

    if (error || !department) {
      console.error('Department not found:', departmentId);
      return { date: null, timeSlot: null };
    }

    // If not scheduled, return today
    if (!department.is_scheduled || !department.available_days) {
      return { 
        date: new Date().toISOString().split('T')[0], 
        timeSlot: 'anytime' 
      };
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const schedule = department.available_days;
    let checkDate = new Date(now);
    const maxDaysToCheck = 14;
    
    // Helper to check if time slot is still open today
    const isTimeSlotStillAvailable = (timeSlots) => {
      for (const slot of timeSlots) {
        if (currentTime < slot.end) {
          return true;
        }
      }
      return false;
    };

    // Check today first
    const todayName = daysOfWeek[checkDate.getDay()];
    if (schedule[todayName]) {
      const timeSlots = schedule[todayName];
      if (isTimeSlotStillAvailable(timeSlots)) {
        // Found available time slot today
        return {
          date: checkDate.toISOString().split('T')[0],
          timeSlot: `${timeSlots[0].start}-${timeSlots[timeSlots.length - 1].end}`,
          department: department.name
        };
      }
    }

    // Check future days
    for (let i = 1; i <= maxDaysToCheck; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      const dayName = daysOfWeek[checkDate.getDay()];
      
      if (schedule[dayName]) {
        const timeSlots = schedule[dayName];
        return {
          date: checkDate.toISOString().split('T')[0],
          timeSlot: `${timeSlots[0].start}-${timeSlots[timeSlots.length - 1].end}`,
          department: department.name
        };
      }
    }

    // Fallback
    console.warn(`No available schedule found for ${department.name}`);
    return { 
      date: new Date().toISOString().split('T')[0], 
      timeSlot: 'by appointment' 
    };
    
  } catch (error) {
    console.error('Error calculating next available date:', error);
    return { date: null, timeSlot: null };
  }
};

const calculateNextAvailableSlot = async (departmentId) => {
  try {
    const { data: department, error } = await supabase
      .from('department')
      .select('is_scheduled, available_days, service_type, name')
      .eq('department_id', departmentId)
      .single();

    if (error || !department) {
      console.error('Department not found:', departmentId);
      return { 
        isScheduled: false, 
        nextAvailableDate: null, 
        isToday: true 
      };
    }

    // If not a scheduled subspecialty, return immediate availability
    if (!department.is_scheduled || department.service_type !== 'subspecialty') {
      return { 
        isScheduled: false, 
        nextAvailableDate: new Date().toISOString().split('T')[0], 
        isToday: true,
        departmentName: department.name
      };
    }

    // Parse the available days schedule
    const schedule = department.available_days;
    if (!schedule || Object.keys(schedule).length === 0) {
      console.warn('No schedule found for subspecialty department:', department.name);
      return { 
        isScheduled: true, 
        nextAvailableDate: null, 
        isToday: false,
        departmentName: department.name 
      };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Check if today is an available day and still within time window
    const todayName = daysOfWeek[now.getDay()];
    if (schedule[todayName]) {
      const timeSlots = schedule[todayName];
      const isStillOpen = timeSlots.some(slot => currentTime < slot.end);
      
      if (isStillOpen) {
        // Check current queue count for today
        const { count: todayQueueCount } = await supabase
          .from('queue')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', departmentId)
          .eq('visit.visit_date', today);

        return {
          isScheduled: true,
          nextAvailableDate: today,
          isToday: true,
          queuePosition: (todayQueueCount || 0) + 1,
          departmentName: department.name,
          timeSlot: `${timeSlots[0].start}-${timeSlots[timeSlots.length - 1].end}`
        };
      }
    }

    // Find next available date
    let checkDate = new Date(now);
    const maxDaysToCheck = 14; // Look ahead 2 weeks
    
    for (let i = 1; i <= maxDaysToCheck; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      const dayName = daysOfWeek[checkDate.getDay()];
      
      if (schedule[dayName]) {
        const nextDate = checkDate.toISOString().split('T')[0];
        
        // Count existing appointments for this date
        const { count: futureQueueCount } = await supabase
          .from('queue')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', departmentId)
          .eq('scheduled_date', nextDate);

        const timeSlots = schedule[dayName];
        
        return {
          isScheduled: true,
          nextAvailableDate: nextDate,
          isToday: false,
          queuePosition: (futureQueueCount || 0) + 1,
          departmentName: department.name,
          dayName: dayName,
          timeSlot: `${timeSlots[0].start}-${timeSlots[timeSlots.length - 1].end}`
        };
      }
    }

    // No available date found within 2 weeks
    return {
      isScheduled: true,
      nextAvailableDate: null,
      isToday: false,
      error: 'No available appointments within the next 2 weeks',
      departmentName: department.name
    };

  } catch (error) {
    console.error('Error calculating next available slot:', error);
    return { 
      isScheduled: false, 
      nextAvailableDate: null, 
      isToday: false,
      error: error.message 
    };
  }
};

// Email Service
const sendEmailOTP = async (email, otp, patientName) => {
  try {
    console.log('📧 Attempting to send email via Brevo API to:', email);
    
    if (!brevoApiInstance) {
      throw new Error('Brevo API not configured - missing API key');
    }
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: emailConfig.from.name,
      email: emailConfig.from.email
    };
    
    sendSmtpEmail.to = [{ email: email, name: patientName }];
    sendSmtpEmail.subject = 'CliCare - Your Verification Code';
    
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Poppins', sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 24px;">
          
          <!-- Greeting -->
          <p style="color: #27371f; font-size: 15px; font-weight: 500; margin: 0 0 2px 0;">
            Hello ${patientName},
          </p>
          
          <p style="color: #6b7280; font-size: 14px; font-weight: 300; line-height: 1.5; margin: 0 0 24px 0;">
            Your verification code is:
          </p>

          <!-- OTP Code -->
          <div style="text-align: center; margin: 0 0 20px 0;">
            <div style="display: inline-block; background: #f9fafb; border-radius: 8px; padding: 10px 20px;">
              <div style="font-size: 24px; font-weight: 600; letter-spacing: 5px; color: #1a672a; font-family: 'Poppins', sans-serif;">
                ${otp}
              </div>
            </div>
          </div>

          <!-- Expiration Notice -->
          <p style="color: #6b7280; font-size: 13px; font-weight: 400; text-align: center; margin: 0 0 20px 0;">
            This code will expire in <strong style="color: #27371f;">5 minutes</strong>
          </p>

          <!-- Divider -->
          <div style="height: 1px; background: #e5e7eb; margin: 0 0 20px 0;"></div>

          <!-- Security Tips -->
          <p style="color: #9ca3af; font-size: 12px; font-weight: 500; line-height: 1; margin: 0 0 10px 0;">
            Security Tips:
          </p>
          
          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1; margin: 0 0 5px 0;">
            • Never share this code with anyone
          </p>
          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1; margin: 0 0 5px 0;">
            • CliCare staff will never ask for your code
          </p>
          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1; margin: 0 0 10px 0;">
            • This code is valid for one-time use only
          </p>

          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1.5; margin: 0 0 20px 0;">
            If you didn't request this code, please ignore this email.
          </p>

          <!-- Footer -->
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #d1d5db; font-size: 11px; font-weight: 300; line-height: 1.5; margin: 0;">
              CliCare Hospital Management System<br>
              This is an automated message. Please do not reply.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully via Brevo API:', result.response?.body?.messageId || result.messageId);
    return { 
      success: true, 
      messageId: result.response?.body?.messageId || result.messageId 
    };
  
  } catch (error) {
    console.error('❌ Brevo API email failed:', error);
    if (error.response?.body) {
      console.error('📧 Brevo error details:', error.response.body);
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Lab Request Email
const sendLabRequestEmail = async (email, patientName, labRequestData) => {
  try {
    console.log('📧 Attempting to send lab request email via Brevo API to:', email);
    
    if (!brevoApiInstance) {
      throw new Error('Brevo API not configured - missing API key');
    }
    
    const testsList = labRequestData.test_requests.map((test, index) => 
      `<li style="margin: 5px 0;">${index + 1}. ${test.test_name} (${test.test_type})</li>`
    ).join('');
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: emailConfig.from.name,
      email: emailConfig.from.email
    };
    
    sendSmtpEmail.to = [{ email: email, name: patientName }];
    sendSmtpEmail.subject = 'CliCare - Lab Test Request';
    
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Poppins', sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 24px;">

          <p style="color: #27371f; font-size: 15px; font-weight: 500; margin: 0 0 2px 0;">
            Hello ${patientName},
          </p>
          
          <p style="color: #6b7280; font-size: 14px; font-weight: 300; line-height: 1.5; margin: 0 0 24px 0;">
            Your doctor has requested the following laboratory test(s):
          </p>

          <div style="text-align: center; margin: 0 0 20px 0;">
            <div style="display: inline-block; background: #f9fafb; border-radius: 8px; padding: 20px 24px; width: 100%; box-sizing: border-box;">
              <div style="text-align: left;">
                <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
                  Requested Tests:
                </p>
                <ul style="color: #6b7280; font-size: 14px; font-weight: 400; line-height: 1.7; margin: 0; padding-left: 20px;">
                  ${testsList}
                </ul>
              </div>
            </div>
          </div>

          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.8;">
              <strong style="color: #27371f;">Request ID:</strong> #${labRequestData.request_id}<br>
              <strong style="color: #27371f;">Priority:</strong> ${labRequestData.priority === 'stat' ? 'STAT (Urgent)' : labRequestData.priority.charAt(0).toUpperCase() + labRequestData.priority.slice(1)}<br>
              <strong style="color: #27371f;">Due Date:</strong> ${new Date(labRequestData.due_date).toLocaleDateString()}<br>
              ${labRequestData.instructions ? `<strong style="color: #27371f;">Instructions:</strong> ${labRequestData.instructions}` : ''}
            </p>
          </div>

          <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
            What to do next:
          </p>
          
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <ol style="color: #6b7280; font-size: 14px; padding-left: 18px; margin: 0; line-height: 1.7;">
              <li>Complete the requested laboratory test(s)</li>
              <li>Log in to your patient portal</li>
              <li>Upload your test results before the due date</li>
              <li>Wait for your doctor to review the results</li>
            </ol>
          </div>

          <p style="color: #dc2626; font-size: 13px; font-weight: 500; margin: 0 0 6px 0;">
            Important
          </p>

          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1.5; margin: 0 0 20px 0;">
            Please complete and upload your test results by <strong style="color: #27371f;">${new Date(labRequestData.due_date).toLocaleDateString()}</strong>. Late submissions may delay your treatment.
          </p>

          <div style="height: 1px; background: #e5e7eb; margin: 0 0 20px 0;"></div>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #d1d5db; font-size: 11px; font-weight: 300; line-height: 1.5; margin: 0;">
              CliCare Hospital Management System<br>
              This is an automated message. Please do not reply.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Lab request email sent successfully via Brevo API');
    return { success: true };
  
  } catch (error) {
    console.error('❌ Lab request email failed:', error);
    if (error.response?.body) {
      console.error('📧 Brevo error details:', error.response.body);
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Lab Result Accepted Email
const sendLabAcceptedEmail = async (email, patientName, labRequestData) => {
  try {
    console.log('📧 Attempting to send lab accepted email via Brevo API to:', email);
    
    if (!brevoApiInstance) {
      throw new Error('Brevo API not configured - missing API key');
    }
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: emailConfig.from.name,
      email: emailConfig.from.email
    };
    
    sendSmtpEmail.to = [{ email: email, name: patientName }];
    sendSmtpEmail.subject = 'CliCare - Lab Results Accepted';
    
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Poppins', sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 24px;">

          <p style="color: #27371f; font-size: 15px; font-weight: 500; margin: 0 0 2px 0;">
            Hello ${patientName},
          </p>
          
          <p style="color: #6b7280; font-size: 14px; font-weight: 300; line-height: 1.5; margin: 0 0 24px 0;">
            Good news! Your doctor has reviewed and accepted your laboratory test results.
          </p>

          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.8;">
              <strong style="color: #27371f;">Request ID:</strong> #${labRequestData.request_id}<br>
              <strong style="color: #27371f;">Test Type:</strong> ${labRequestData.test_type}<br>
              <strong style="color: #27371f;">Status:</strong> <span style="color: #059669; font-weight: 500;">Accepted</span><br>
              <strong style="color: #27371f;">Reviewed Date:</strong> ${new Date().toLocaleDateString()}
            </p>
          </div>

          <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
            What happens next:
          </p>
          
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <ol style="color: #6b7280; font-size: 14px; padding-left: 18px; margin: 0; line-height: 1.7;">
              <li>Your test results have been added to your medical records</li>
              <li>Your doctor will discuss the results during your next consultation</li>
              <li>Follow any treatment recommendations provided by your doctor</li>
              <li>Schedule a follow-up appointment if needed</li>
            </ol>
          </div>

          <p style="color: #059669; font-size: 13px; font-weight: 500; margin: 0 0 6px 0;">
            Results Accepted
          </p>

          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1.5; margin: 0 0 20px 0;">
            Your laboratory results have been reviewed and accepted by your healthcare provider. You can view your complete medical records in the patient portal.
          </p>

          <div style="height: 1px; background: #e5e7eb; margin: 0 0 20px 0;"></div>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #d1d5db; font-size: 11px; font-weight: 300; line-height: 1.5; margin: 0;">
              CliCare Hospital Management System<br>
              This is an automated message. Please do not reply.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Lab accepted email sent successfully via Brevo API');
    return { success: true };
  
  } catch (error) {
    console.error('❌ Lab accepted email failed:', error);
    if (error.response?.body) {
      console.error('📧 Brevo error details:', error.response.body);
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Lab Result Declined Email
const sendLabDeclinedEmail = async (email, patientName, labRequestData, declineReason) => {
  try {
    console.log('📧 Attempting to send lab declined email via Brevo API to:', email);
    
    if (!brevoApiInstance) {
      throw new Error('Brevo API not configured - missing API key');
    }
    
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      name: emailConfig.from.name,
      email: emailConfig.from.email
    };
    
    sendSmtpEmail.to = [{ email: email, name: patientName }];
    sendSmtpEmail.subject = 'CliCare - Lab Results Need Resubmission';
    
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Poppins', sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 24px;">

          <p style="color: #27371f; font-size: 15px; font-weight: 500; margin: 0 0 2px 0;">
            Hello ${patientName},
          </p>
          
          <p style="color: #6b7280; font-size: 14px; font-weight: 300; line-height: 1.5; margin: 0 0 24px 0;">
            Your doctor has reviewed your laboratory test results and is requesting a resubmission.
          </p>

          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.8;">
              <strong style="color: #27371f;">Request ID:</strong> #${labRequestData.request_id}<br>
              <strong style="color: #27371f;">Test Type:</strong> ${labRequestData.test_type}<br>
              <strong style="color: #27371f;">Status:</strong> <span style="color: #dc2626; font-weight: 500;">Declined</span><br>
              <strong style="color: #27371f;">Reviewed Date:</strong> ${new Date().toLocaleDateString()}
            </p>
          </div>

          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 8px 0;">
              Reason for Decline:
            </p>
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.5;">
              ${declineReason || 'The submitted results require clarification or resubmission. Please contact your healthcare provider for details.'}
            </p>
          </div>

          <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
            What to do next:
          </p>
          
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <ol style="color: #6b7280; font-size: 14px; padding-left: 18px; margin: 0; line-height: 1.7;">
              <li>Review the decline reason above carefully</li>
              <li>Obtain corrected or clearer test results if needed</li>
              <li>Log in to your patient portal</li>
              <li>Resubmit the laboratory test results</li>
              <li>Contact the hospital if you have questions</li>
            </ol>
          </div>

          <p style="color: #dc2626; font-size: 13px; font-weight: 500; margin: 0 0 6px 0;">
            Action Required
          </p>

          <p style="color: #9ca3af; font-size: 12px; font-weight: 300; line-height: 1.5; margin: 0 0 20px 0;">
            Please resubmit your test results as soon as possible to avoid delays in your treatment. If you need assistance, please contact our patient support team.
          </p>

          <div style="height: 1px; background: #e5e7eb; margin: 0 0 20px 0;"></div>

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #d1d5db; font-size: 11px; font-weight: 300; line-height: 1.5; margin: 0;">
              CliCare Hospital Management System<br>
              This is an automated message. Please do not reply.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Lab declined email sent successfully via Brevo API');
    return { success: true };
  
  } catch (error) {
    console.error('❌ Lab declined email failed:', error);
    if (error.response?.body) {
      console.error('📧 Brevo error details:', error.response.body);
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// SMS Service
const sendSMSOTP = async (phoneNumber, otp, patientName) => {
  try {
    if (!isSMSConfigured) {
      throw new Error('SMS service not configured. Please contact administrator.');
    }
    
    console.log('📱 Starting SMS send process...');
    console.log('   Original phone number:', phoneNumber);
    
    let formattedPhone = phoneNumber.toString().trim();
    
    // Convert Philippine numbers to international format (+639XXXXXXXXX)
    // Your database stores numbers as: 09123456789
    // TextBee needs: +639123456789
    if (formattedPhone.startsWith('09')) {
      // 09123456789 -> +639123456789
      formattedPhone = '+63' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('639')) {
      // 639123456789 -> +639123456789
      formattedPhone = '+' + formattedPhone;
    } else if (formattedPhone.startsWith('+639')) {
      // Already in correct format
      formattedPhone = formattedPhone;
    } else if (formattedPhone.startsWith('63')) {
      // 63123456789 -> +639123456789
      formattedPhone = '+' + formattedPhone;
    }
    
    console.log('   Formatted phone number:', formattedPhone);
    
    // Validate Philippine number format
    if (!/^\+639\d{9}$/.test(formattedPhone)) {
      console.error('❌ Invalid phone format:', formattedPhone);
      throw new Error('Invalid Philippine mobile number format');
    }
    
    const message = `CLICARE: Your verification code is ${otp}. Valid for 5 minutes. Do not share this code.`;
    
    console.log('   Sending to TextBee API...');
    console.log('   Device ID:', TEXTBEE_CONFIG.deviceId);
    console.log('   API URL:', `${TEXTBEE_CONFIG.apiUrl}/gateway/devices/${TEXTBEE_CONFIG.deviceId}/send-sms`);
    
    // Send SMS using TextBee API
    const response = await axios.post(
      `${TEXTBEE_CONFIG.apiUrl}/gateway/devices/${TEXTBEE_CONFIG.deviceId}/send-sms`,
      {
        recipients: [formattedPhone],
        message: message
      },
      {
        headers: {
          'x-api-key': TEXTBEE_CONFIG.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('✅ TextBee API response:', JSON.stringify(response.data, null, 2));
    
    // TextBee response structure check
    // Check multiple possible success indicators
    if (response.data) {
      // TextBee might return: { success: true, messageId: "..." }
      // OR: { status: "success", ... }
      // OR: { data: { success: true } }
      
      const isSuccess = 
        response.data.success === true ||
        response.data.status === 'success' ||
        response.data.status === 'queued' ||
        (response.data.data && response.data.data.success === true) ||
        response.status === 200; // If status code is 200, consider it success
      
      if (isSuccess) {
        console.log('✅ SMS sent successfully!');
        return {
          success: true,
          messageId: response.data.messageId || response.data.id || 'textbee_' + Date.now(),
          provider: 'TextBee',
          recipient: formattedPhone
        };
      } else {
        console.error('❌ TextBee returned unsuccessful response:', response.data);
        throw new Error('SMS sending failed: ' + (response.data.error || response.data.message || 'Unknown error'));
      }
    } else {
      console.error('❌ Empty response from TextBee');
      throw new Error('SMS sending failed: Empty response from TextBee');
    }
    
  } catch (error) {
    console.error('❌ SMS sending error:', error);
    
    // Detailed error logging
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
      console.error('   Response headers:', error.response.headers);
    }
    
    // Handle different types of errors
    if (error.code === 'ECONNABORTED') {
      throw new Error('SMS service timeout. Please try again.');
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to TextBee service. Please check if your Android device is online and the TextBee app is running.');
    } else if (error.code === 'ENOTFOUND') {
      throw new Error('TextBee service not found. Please check your internet connection.');
    } else if (error.response) {
      // HTTP error response from TextBee
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        throw new Error('Invalid TextBee API key. Please check your configuration.');
      } else if (status === 404) {
        throw new Error('TextBee device not found. Please check your Device ID.');
      } else if (status === 400) {
        const errorMsg = data?.error || data?.message || 'Invalid request';
        throw new Error(`TextBee error: ${errorMsg}`);
      } else {
        const errorMsg = data?.error || data?.message || status;
        throw new Error(`SMS service error: ${errorMsg}`);
      }
    } else if (error.message.includes('Network Error')) {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(error.message || 'Failed to send SMS');
    }
  }
};

const hasOnlyRoutineCareSymptoms = (symptoms) => {
  const routineCareSymptoms = [
    'Annual Check-up',
    'Health Screening', 
    'Vaccination',
    'Physical Exam',
    'Blood Pressure Check',
    'Cholesterol Screening',
    'Diabetes Screening',
    'Cancer Screening'
  ];
  
  if (!symptoms || symptoms.length === 0) return false;
  
  const symptomsList = Array.isArray(symptoms) ? symptoms : symptoms.split(', ');
  
  return symptomsList.every(symptom => routineCareSymptoms.includes(symptom.trim()));
};

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and documents are allowed!'));
    }
  }
});

const uploadToSupabaseStorage = async (fileBuffer, fileName, bucketName = 'lab-results') => {
  try {
    // Get the file extension and determine MIME type
    const fileExt = path.extname(fileName).toLowerCase();
    let contentType;
    
    // Map only the required file types
    switch (fileExt) {
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.pdf':
        contentType = 'application/pdf';
        break;
      default:
        throw new Error(`Unsupported file type: ${fileExt}. Only PDF, JPEG, PNG, and JPG files are allowed.`);
    }

    console.log(`Uploading file: ${fileName} with content type: ${contentType}`);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: contentType,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error details:', error);
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`File uploaded successfully: ${urlData.publicUrl}`);

    return {
      success: true,
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  } catch (error) {
    console.error('Supabase upload error:', error);
    throw error;
  }
};

const uploadDir = path.join(__dirname, 'uploads', 'lab-results');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGINS 
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : ['https://clicare-web.vercel.app'])
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  console.log('🌐 Allowed CORS origins:', allowedOrigins);
  console.log('🔧 NODE_ENV:', process.env.NODE_ENV);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed for:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked for:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 600
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiters
const generalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    error: 'Too many requests from this network. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

app.get('/api/print/printers', async (req, res) => {
  try {
    const printers = await printServer.getAvailablePrinters();
    res.json({
      success: true,
      printers: printers
    });
  } catch (error) {
    console.error('Failed to get printers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Print patient guidance packet
app.post('/api/print/guidance', async (req, res) => {
  try {
    const { 
      registrationData, 
      patientData, 
      navigationSteps, 
      floorPlanImage,
      printerName 
    } = req.body;

    console.log('🖨️ Print request received for patient:', registrationData.patientId);

    // Validate required data
    if (!registrationData || !patientData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required patient data'
      });
    }

    // ✅ NEW: Fetch queue color from database
    const department = registrationData.recommendedDepartment;
    let queueColor = 'Gray'; // Default
    
    try {
      const { data: deptData } = await supabase
        .from('department')
        .select('queue_color')
        .eq('name', department)
        .single();
      
      if (deptData && deptData.queue_color) {
        queueColor = deptData.queue_color;
      }
      console.log('🎨 Queue color for', department, ':', queueColor);
    } catch (err) {
      console.warn('⚠️ Could not fetch queue color, using default');
    }

    // Print the document (with queue color)
    const result = await printServer.printPatientGuidance(
      registrationData,
      patientData,
      navigationSteps || [],
      floorPlanImage || null,
      queueColor  // ✅ ONLY CHANGE: Added this parameter
    );

    if (result.success) {
      console.log('✅ Print job completed successfully');
      res.json({
        success: true,
        message: 'Document sent to printer successfully'
      });
    } else {
      console.error('❌ Print job failed:', result.error);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Print endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Print thermal receipt
app.post('/api/print/receipt', async (req, res) => {
  try {
    const { registrationData, patientData } = req.body;

    console.log('🖨️ Receipt print request for:', registrationData.patientId);

    // Generate simple receipt HTML
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 80mm;
            margin: 0;
            padding: 10mm;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 5mm 0; }
        </style>
      </head>
      <body>
        <div class="center bold">CLICARE HOSPITAL</div>
        <div class="center">Patient Registration Receipt</div>
        <div class="line"></div>
        <div class="bold">PATIENT ID: ${registrationData.patientId}</div>
        <div>Name: ${patientData.fullName || patientData.name}</div>
        <div>Age/Sex: ${patientData.age} / ${patientData.sex}</div>
        <div class="line"></div>
        <div class="bold">DEPARTMENT: ${registrationData.recommendedDepartment}</div>
        <div class="bold">QUEUE NO: ${registrationData.queue_number || 'N/A'}</div>
        <div class="line"></div>
        <div><strong>SYMPTOMS:</strong></div>
        <div>${(patientData.selectedSymptoms || []).join(', ')}</div>
        <div class="line"></div>
        <div><strong>NEXT STEPS:</strong></div>
        <div>1. Go to Reception Desk</div>
        <div>2. Present this receipt</div>
        <div>3. Proceed to ${registrationData.recommendedDepartment}</div>
        <div>4. Wait for queue number</div>
        <div class="line"></div>
        <div class="center">Visit: ${new Date().toLocaleString()}</div>
        <div class="line"></div>
        <div class="center">Keep this receipt for your visit</div>
      </body>
      </html>
    `;

    // Create PDF and print
    const timestamp = Date.now();
    const pdfPath = path.join(__dirname, 'temp', `receipt_${timestamp}.pdf`);
    
    await printServer.generatePDF(receiptHTML, pdfPath);
    await printServer.printPDF(pdfPath);

    res.json({
      success: true,
      message: 'Receipt printed successfully'
    });

  } catch (error) {
    console.error('❌ Receipt print error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test print endpoint (for debugging)
app.post('/api/print/test', async (req, res) => {
  try {
    const testHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; padding: 20px; }
          h1 { color: #1a672a; }
        </style>
      </head>
      <body>
        <h1>CliCare Hospital - Test Print</h1>
        <p>This is a test print from the CliCare print server.</p>
        <p>Date: ${new Date().toLocaleString()}</p>
        <p>If you can see this, the print server is working correctly!</p>
      </body>
      </html>
    `;

    const timestamp = Date.now();
    const pdfPath = path.join(__dirname, 'temp', `test_${timestamp}.pdf`);
    
    await printServer.generatePDF(testHTML, pdfPath);
    await printServer.printPDF(pdfPath);

    res.json({
      success: true,
      message: 'Test print sent successfully'
    });

  } catch (error) {
    console.error('❌ Test print error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Healthcare Provider Login
app.post('/api/staff/login', generalLoginLimiter, async (req, res) => {
  try {
    const { staffId, password } = req.body;

    if (!staffId || !password) {
      return res.status(400).json({
        error: 'Staff ID and password are required'
      });
    }

    try {
      checkAccountRateLimit(`healthcare:${staffId.toLowerCase()}`);
    } catch (rateLimitError) {
      return res.status(429).json({
        error: rateLimitError.message
      });
    }

    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('staff_id', staffId)
      .single();

    if (staffError || !staffData) {
      recordFailedAttempt(`healthcare:${staffId.toLowerCase()}`);
      return res.status(404).json({
        error: 'Healthcare Provider ID not found'
      });
    }

    let isValidPassword = false;
    
    if (staffData.password === password) {
      isValidPassword = true;
    } else {
      try {
        isValidPassword = await verifyPassword(password, staffData.password);
      } catch (error) {
        console.log('Bcrypt comparison failed:', error.message);
      }
    }
    
    if (!isValidPassword) {
      recordFailedAttempt(`healthcare:${staffId.toLowerCase()}`);
      return res.status(401).json({
        error: 'Incorrect password'
      });
    }

    clearFailedAttempts(`healthcare:${staffId.toLowerCase()}`);

    const token = jwt.sign(
      {
        id: staffData.id,
        staff_id: staffData.staff_id,
        name: staffData.name,
        role: staffData.role,
        specialization: staffData.specialization,
        department_id: staffData.department_id,
        type: 'healthcare'
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await supabase
        .from('staff')
        .update({
          is_online: true,
          last_login: new Date().toISOString(),
          last_activity: new Date().toISOString()
        })
        .eq('id', staffData.id);

    const { password: _, ...staffInfo } = staffData;
    
    res.status(200).json({
      success: true,
      token,
      staff: staffInfo,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Healthcare login error:', error);
    res.status(500).json({
      error: 'Internal server error during login'
    });
  }
});

// Admin Login
app.post('/api/admin/login', generalLoginLimiter, async (req, res) => {
  try {
    const { healthadminid, password } = req.body;

    if (!healthadminid || !password) {
      return res.status(400).json({
        error: 'Admin ID and password are required'
      });
    }

    try {
      checkAccountRateLimit(`admin:${healthadminid.toLowerCase()}`);
    } catch (rateLimitError) {
      return res.status(429).json({
        error: rateLimitError.message
      });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admin')
      .select('*')
      .eq('healthadmin_id', healthadminid)
      .single();

    if (adminError || !adminData) {
      recordFailedAttempt(`admin:${healthadminid.toLowerCase()}`);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    let isValidPassword = false;
    
    if (adminData.password === password) {
      isValidPassword = true;
    } else {
      try {
        isValidPassword = await verifyPassword(password, adminData.password);
      } catch (error) {
        console.log('Bcrypt comparison failed:', error.message);
      }
    }
    
    if (!isValidPassword) {
      recordFailedAttempt(`admin:${healthadminid.toLowerCase()}`);
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    clearFailedAttempts(`admin:${healthadminid.toLowerCase()}`);

    const token = jwt.sign(
      {
        id: adminData.id,
        healthadmin_id: adminData.healthadmin_id,
        name: adminData.name,
        position: adminData.position,
        type: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const { password: _, ...adminInfo } = adminData;
    
    res.status(200).json({
      success: true,
      token,
      admin: adminInfo,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      error: 'Internal server error during login'
    });
  }
});

// Add these endpoints to your existing server.js

// Get time slots
app.get('/api/time-slots', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('is_active', true)
      .order('slot_id');

    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch time slots' });
  }
});

// Get relationships
app.get('/api/relationships', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('relationship_types')
      .select('*')
      .eq('is_active', true)
      .order('id');

    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

// Get severity levels
app.get('/api/severity-levels', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('severity_levels')
      .select('*')
      .eq('is_active', true)
      .order('id');

    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch severity levels' });
  }
});

// Get duration options
app.get('/api/duration-options', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('duration_options')
      .select('*')
      .eq('is_active', true)
      .order('id');

    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch duration options' });
  }
});

// Get symptom-department mapping
app.get('/api/symptom-department-mapping', async (req, res) => {
  try {
    const { data: mappings, error } = await supabase
      .from('symptom_department')
      .select(`
        symptom_name,
        department_id,
        priority,
        age_min,
        age_max,
        conditions,
        department!inner(name)
      `)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      mappings: mappings || []
    });
  } catch (error) {
    console.error('Error fetching symptom mappings:', error);
    res.status(500).json({ error: 'Failed to fetch symptom mappings' });
  }
});

// Get navigation steps for a department
app.get('/api/navigation-steps/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    // Get department info WITH floor plan image
    const { data: department, error: deptError } = await supabase
      .from('department')
      .select('department_id, name, floor_plan_image, floor_plan_image_type')
      .eq('department_id', departmentId)
      .single();

    if (deptError) throw deptError;

    // Get navigation steps
    const { data: steps, error: stepsError } = await supabase
      .from('navigation_steps')
      .select('*')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('step_order', { ascending: true });

    if (stepsError) throw stepsError;

    // Format floor plan image as data URL
    const floorPlanUrl = department.floor_plan_image 
      ? `data:image/${department.floor_plan_image_type};base64,${department.floor_plan_image}`
      : null;

    res.json({
      success: true,
      departmentName: department.name,
      floorPlanImage: floorPlanUrl, // ONE image for entire route
      steps: steps || []
    });

  } catch (error) {
    console.error('Error fetching navigation steps:', error);
    res.status(500).json({ error: 'Failed to fetch navigation steps' });
  }
});

// Get navigation steps by department name (for printingService)
app.get('/api/navigation-steps-by-name/:departmentName', async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    const { data: steps, error } = await supabase
      .from('navigation_steps')
      .select(`
        step_order,
        location_name,
        description,
        floor_number,
        room_numbers,
        department!inner(name)
      `)
      .eq('department.name', departmentName)
      .eq('is_active', true)
      .order('step_order', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      steps: steps || []
    });
  } catch (error) {
    console.error('Error fetching navigation steps by name:', error);
    res.status(500).json({ error: 'Failed to fetch navigation steps' });
  }
});

// Get Admin Dashboard Statistics
app.get('/api/admin/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Total Patients
    const { count: totalPatients } = await supabase
      .from('outpatient')
      .select('*', { count: 'exact', head: true });

    // Out-Patients Today
    const { count: outPatientsToday } = await supabase
      .from('queue')
      .select(`visit!inner(visit_date)`, { count: 'exact', head: true })
      .eq('visit.visit_date', today);

    // ADD THIS SECTION HERE - Calculate yesterday's patients for trend
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const { count: yesterdayPatients } = await supabase
      .from('queue')
      .select(`visit!inner(visit_date)`, { count: 'exact', head: true })
      .eq('visit.visit_date', yesterdayStr);

    const patientTrend = yesterdayPatients > 0 
      ? ((outPatientsToday - yesterdayPatients) / yesterdayPatients * 100).toFixed(1)
      : 0;
    // END OF NEW SECTION

    // Active Consultants (Online)
    const { count: activeConsultants } = await supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'Doctor')
      .eq('is_online', true);

    // Appointments Today
    const { count: appointmentsToday } = await supabase
      .from('pre_registration')
      .select('*', { count: 'exact', head: true })
      .eq('scheduled_date', today)
      .in('status', ['pending', 'completed']);

    // Top 3 Health Trends (most common symptoms today)
    const { data: symptomsData } = await supabase
      .from('visit')
      .select('symptoms')
      .eq('visit_date', today);

    const symptomCounts = {};
    symptomsData?.forEach(visit => {
      if (visit.symptoms) {
        const symptomList = visit.symptoms.split(', ');
        symptomList.forEach(symptom => {
          symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
        });
      }
    });

    const topSymptoms = Object.entries(symptomCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    // System Alerts (departments with long queues)
    const { data: queueData } = await supabase
      .from('queue')
      .select(`
        department_id,
        status,
        department!inner(name),
        visit!inner(visit_date)
      `)
      .eq('status', 'waiting')
      .eq('visit.visit_date', today);

    const departmentQueues = {};
    queueData?.forEach(item => {
      const deptName = item.department.name;
      departmentQueues[deptName] = (departmentQueues[deptName] || 0) + 1;
    });

    const alerts = Object.entries(departmentQueues)
      .filter(([_, count]) => count > 10)
      .map(([department, count]) => ({ department, count }));

    // Patient Flow Statistics
    const { data: flowData } = await supabase
      .from('queue')
      .select(`
        status,
        department_id,
        created_time,
        visit!inner(visit_date)
      `)
      .eq('visit.visit_date', today);

    const flowStats = {
      registration: flowData?.filter(q => q.status === 'waiting').length || 0,
      consultation: flowData?.filter(q => q.status === 'in_progress').length || 0,
      completed: flowData?.filter(q => q.status === 'completed').length || 0
    };

    // Calculate average wait time
    const waitTimes = flowData?.map(q => {
      const created = new Date(q.created_time);
      const now = new Date();
      return Math.floor((now - created) / (1000 * 60)); // minutes
    }) || [];
    const avgWaitTime = waitTimes.length > 0 
      ? Math.floor(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) 
      : 0;

    // MODIFY THE RESPONSE TO INCLUDE TRENDS
    res.status(200).json({
      success: true,
      stats: {
        totalRegisteredPatients: totalPatients || 0,
        outPatientToday: outPatientsToday || 0,
        activeConsultants: activeConsultants || 0,
        appointmentsToday: appointmentsToday || 0
      },
      trends: {
        patients: patientTrend  // ADD THIS LINE
      },
      topHealthTrends: topSymptoms,
      systemAlerts: alerts,
      patientFlow: flowStats,
      averageWaitTime: avgWaitTime
    });

  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/time-series-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { period } = req.query;
    
    let timeSeriesData = [];
    
    if (period === 'daily') {
      // Last 30 days
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Get registration data
      const { data: registrationData, error: regError } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate)
        .order('registration_date', { ascending: true });
      
      // Get appointment data - Fixed query
      const { data: appointmentData, error: apptError } = await supabase
        .from('pre_registration')
        .select('created_date, scheduled_date, preferred_date')
        .gte('created_date', startDate)
        .not('status', 'eq', 'expired')
        .order('created_date', { ascending: true });
      
      // Get completed consultations data - Fixed query
      const { data: completedData, error: compError } = await supabase
        .from('queue')
        .select(`
          created_time,
          visit!inner(
            visit_date,
            visit_time
          )
        `)
        .eq('status', 'completed')
        .gte('created_time', startDate + 'T00:00:00.000Z')
        .order('created_time', { ascending: true });
      
      if (regError) {
        console.error('Registration fetch error:', regError);
        return res.status(500).json({ error: 'Failed to fetch time series data' });
      }
      
      // Group by date
      const registrationCounts = {};
      const appointmentCounts = {};
      const completedCounts = {};
      
      // Process registrations
      registrationData?.forEach(patient => {
        const date = patient.registration_date;
        registrationCounts[date] = (registrationCounts[date] || 0) + 1;
      });
      
      // Process appointments - use created_date as primary, fallback to scheduled_date
      appointmentData?.forEach(appt => {
        let date = null;
        if (appt.scheduled_date) {
          date = appt.scheduled_date;
        } else if (appt.preferred_date) {
          date = appt.preferred_date;
        } else if (appt.created_date) {
          date = appt.created_date;
        }
        
        if (date) {
          appointmentCounts[date] = (appointmentCounts[date] || 0) + 1;
        }
      });
      
      // Process completed - extract date from timestamp
      completedData?.forEach(item => {
        let date = null;
        if (item.visit && item.visit.visit_date) {
          date = item.visit.visit_date;
        } else if (item.created_time) {
          // Extract date from timestamp
          date = new Date(item.created_time).toISOString().split('T')[0];
        }
        
        if (date) {
          completedCounts[date] = (completedCounts[date] || 0) + 1;
        }
      });
      
      // Fill in missing dates with 0
      for (let i = 29; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        timeSeriesData.push({
          date: date,
          count: registrationCounts[date] || 0,
          registrations: registrationCounts[date] || 0,
          appointments: appointmentCounts[date] || 0,
          completed: completedCounts[date] || 0
        });
      }
      
    } else if (period === 'weekly') {
      // Similar fixes for weekly...
      const startDate = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: registrationData } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate);
      
      const { data: appointmentData } = await supabase
        .from('pre_registration')
        .select('created_date, scheduled_date, preferred_date')
        .gte('created_date', startDate)
        .not('status', 'eq', 'expired');
      
      const { data: completedData } = await supabase
        .from('queue')
        .select('created_time, visit!inner(visit_date)')
        .eq('status', 'completed')
        .gte('created_time', startDate + 'T00:00:00.000Z');
      
      // Process weekly data similar to daily but group by week
      const registrationWeekCounts = {};
      const appointmentWeekCounts = {};
      const completedWeekCounts = {};
      
      registrationData?.forEach(patient => {
        const date = new Date(patient.registration_date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        registrationWeekCounts[weekKey] = (registrationWeekCounts[weekKey] || 0) + 1;
      });
      
      appointmentData?.forEach(appt => {
        let dateStr = appt.scheduled_date || appt.preferred_date || appt.created_date;
        if (dateStr) {
          const date = new Date(dateStr);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];
          appointmentWeekCounts[weekKey] = (appointmentWeekCounts[weekKey] || 0) + 1;
        }
      });
      
      completedData?.forEach(item => {
        let dateStr = item.visit?.visit_date || item.created_time;
        if (dateStr) {
          const date = new Date(dateStr);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split('T')[0];
          completedWeekCounts[weekKey] = (completedWeekCounts[weekKey] || 0) + 1;
        }
      });
      
      // Fill weekly data
      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        timeSeriesData.push({
          date: weekKey,
          count: registrationWeekCounts[weekKey] || 0,
          registrations: registrationWeekCounts[weekKey] || 0,
          appointments: appointmentWeekCounts[weekKey] || 0,
          completed: completedWeekCounts[weekKey] || 0
        });
      }
      
    } else if (period === 'yearly') {
      // Similar fixes for yearly...
      const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: registrationData } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate);
      
      const { data: appointmentData } = await supabase
        .from('pre_registration')
        .select('created_date, scheduled_date, preferred_date')
        .gte('created_date', startDate)
        .not('status', 'eq', 'expired');
      
      const { data: completedData } = await supabase
        .from('queue')
        .select('created_time, visit!inner(visit_date)')
        .eq('status', 'completed')
        .gte('created_time', startDate + 'T00:00:00.000Z');
      
      // Process yearly data
      const registrationYearCounts = {};
      const appointmentYearCounts = {};
      const completedYearCounts = {};
      
      registrationData?.forEach(patient => {
        const year = new Date(patient.registration_date).getFullYear();
        registrationYearCounts[year] = (registrationYearCounts[year] || 0) + 1;
      });
      
      appointmentData?.forEach(appt => {
        let dateStr = appt.scheduled_date || appt.preferred_date || appt.created_date;
        if (dateStr) {
          const year = new Date(dateStr).getFullYear();
          appointmentYearCounts[year] = (appointmentYearCounts[year] || 0) + 1;
        }
      });
      
      completedData?.forEach(item => {
        let dateStr = item.visit?.visit_date || item.created_time;
        if (dateStr) {
          const year = new Date(dateStr).getFullYear();
          completedYearCounts[year] = (completedYearCounts[year] || 0) + 1;
        }
      });
      
      // Fill yearly data
      const currentYear = new Date().getFullYear();
      for (let i = 4; i >= 0; i--) {
        const year = currentYear - i;
        timeSeriesData.push({
          date: `${year}-01-01`,
          count: registrationYearCounts[year] || 0,
          registrations: registrationYearCounts[year] || 0,
          appointments: appointmentYearCounts[year] || 0,
          completed: completedYearCounts[year] || 0
        });
      }
    }
    
    res.status(200).json({
      success: true,
      timeSeriesData: timeSeriesData
    });
    
  } catch (error) {
    console.error('Time series stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/analyze-data', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { query, hospitalData } = req.body;
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // ✅ ENHANCED PROMPT WITH PROPER PRIVACY PROTECTION
    const context = `You are CliCare Hospital's data analyst assistant. You MUST comply with RA 10173 (Data Privacy Act) and DOH AO 2020-0030.

⚠️ CRITICAL PRIVACY RULES:
1. NEVER reveal patient names, contact numbers, email addresses, or patient IDs
2. NEVER reveal specific medical conditions linked to patient identities
3. ALWAYS provide aggregated, anonymized statistics when asked
4. If asked for PERSONAL information, respond: "I cannot provide personal patient information due to data privacy regulations (RA 10173)"

✅ ALLOWED QUERIES (Aggregated Statistics):
- "How many patients visited today?" → Answer with count
- "What is the average age?" → Answer with average
- "Show top 5 symptoms" → Answer with symptom names and counts
- "What percentage have diabetes?" → Answer with percentage only
- "How many patients in queue?" → Answer with count
- "What are common diagnoses?" → Answer with diagnosis names and counts
- "Show patient trends" → Answer with trend data (no names)
- "Department utilization rates" → Answer with statistics
- Any query asking for COUNTS, AVERAGES, PERCENTAGES, TRENDS, STATISTICS

❌ BLOCKED QUERIES (Personal Information):
- "Show me John Doe's records" → REFUSE
- "What is patient PAT123's phone number?" → REFUSE
- "Give me contact info for patients" → REFUSE
- "List patients with diabetes and their names" → REFUSE
- "Who is the patient in queue 3?" → REFUSE
- "Show me patients in emergency room" → REFUSE (names)
- Any query asking for NAMES, PHONE NUMBERS, EMAILS, PATIENT IDs, ADDRESSES

CURRENT HOSPITAL DATA (AGGREGATED ONLY):
- Total Registered Patients: ${hospitalData.totalRegisteredPatients || 0}
- Out-Patients Today: ${hospitalData.outPatientToday || 0}
- Active Consultants (Online): ${hospitalData.activeConsultants || 0}
- Appointments Today: ${hospitalData.appointmentsToday || 0}

USER QUESTION: "${query}"

DECISION PROCESS:
1. Does the question ask for a NAME, PHONE, EMAIL, or PATIENT ID? → ❌ REFUSE
2. Does the question ask for identifiable patient information? → ❌ REFUSE
3. Does the question ask for a NUMBER, COUNT, AVERAGE, or PERCENTAGE? → ✅ ANSWER
4. Does the question ask for aggregated trends or statistics? → ✅ ANSWER

RESPONSE RULES:
- If asking for personal info → Refuse with privacy message
- If asking for statistics → Provide aggregated data ALWAYS
- Never include patient names/IDs in any response
- Use phrases like "X patients", "Y cases", "Z percent"
- Statistical queries should ALWAYS be answered with data

RESPONSE FORMAT (JSON):
{
  "textResponse": "Your answer here (NO PERSONAL INFORMATION)",
  "chartType": "bar|pie|line|none",
  "chartData": [{"name": "Label", "value": 123}],
  "chartTitle": "Brief chart title"
}

CORRECT RESPONSE EXAMPLES:

❌ Question: "Show me John Doe's medical records"
Response: {
  "textResponse": "I cannot provide individual patient records due to data privacy regulations (RA 10173). I can provide aggregated statistics instead.",
  "chartType": "none",
  "chartData": [],
  "chartTitle": ""
}

❌ Question: "What is patient PAT123's phone number?"
Response: {
  "textResponse": "I cannot provide patient contact information due to data privacy regulations (RA 10173).",
  "chartType": "none",
  "chartData": [],
  "chartTitle": ""
}

✅ Question: "How many patients visited today?"
Response: {
  "textResponse": "Today we had ${hospitalData.outPatientToday || 0} patient visits.",
  "chartType": "none",
  "chartData": [],
  "chartTitle": ""
}

✅ Question: "What is the average age of patients?"
Response: {
  "textResponse": "Based on our patient database of ${hospitalData.totalRegisteredPatients || 0} registered patients, the average patient age is approximately 42 years. This helps us understand our patient demographics for better healthcare planning.",
  "chartType": "bar",
  "chartData": [
    {"name": "0-18", "value": 450},
    {"name": "19-35", "value": 820},
    {"name": "36-50", "value": 1200},
    {"name": "51-65", "value": 980},
    {"name": "65+", "value": 650}
  ],
  "chartTitle": "Patient Age Distribution"
}

✅ Question: "What percentage of patients have diabetes?"
Response: {
  "textResponse": "Based on aggregated medical records, approximately 15% of our patient population has been diagnosed with diabetes mellitus. This represents about ${Math.floor((hospitalData.totalRegisteredPatients || 0) * 0.15)} cases among our ${hospitalData.totalRegisteredPatients || 0} registered patients. This is slightly above the national average of 12%.",
  "chartType": "pie",
  "chartData": [
    {"name": "Diabetes", "value": 15},
    {"name": "Hypertension", "value": 22},
    {"name": "Asthma", "value": 8},
    {"name": "Heart Disease", "value": 12},
    {"name": "Other", "value": 43}
  ],
  "chartTitle": "Common Chronic Conditions (%)"
}

✅ Question: "Show me the top 5 most common symptoms"
Response: {
  "textResponse": "Based on today's patient visits, the top 5 most common presenting symptoms are: 1) Fever (28%), 2) Cough (22%), 3) Headache (18%), 4) Body pain (15%), 5) Fatigue (12%). These represent ${hospitalData.outPatientToday || 0} patient visits today.",
  "chartType": "bar",
  "chartData": [
    {"name": "Fever", "value": 28},
    {"name": "Cough", "value": 22},
    {"name": "Headache", "value": 18},
    {"name": "Body pain", "value": 15},
    {"name": "Fatigue", "value": 12}
  ],
  "chartTitle": "Top 5 Common Symptoms Today"
}

✅ Question: "How many patients are currently in queue?"
Response: {
  "textResponse": "There are currently 23 patients in queue across all departments. The average wait time is approximately 25 minutes. Emergency department has the longest queue with 8 patients.",
  "chartType": "bar",
  "chartData": [
    {"name": "Emergency", "value": 8},
    {"name": "Internal Medicine", "value": 7},
    {"name": "Pediatrics", "value": 5},
    {"name": "OB-GYN", "value": 3}
  ],
  "chartTitle": "Current Queue by Department"
}

✅ Question: "Show me monthly patient trends"
Response: {
  "textResponse": "Patient visit trends over the past 6 months show seasonal patterns. We observed peak visits in March (1,245 patients) likely due to flu season, and lower visits in June (892 patients). The average monthly visits are 1,050 patients.",
  "chartType": "line",
  "chartData": [
    {"name": "Jan", "value": 1020},
    {"name": "Feb", "value": 1100},
    {"name": "Mar", "value": 1245},
    {"name": "Apr", "value": 980},
    {"name": "May", "value": 920},
    {"name": "Jun", "value": 892}
  ],
  "chartTitle": "Monthly Patient Visit Trends"
}

✅ Question: "What is the average age of pediatric patients?"
Response: {
  "textResponse": "Among our pediatric patients (ages 0-18), the average age is 8.5 years. The Pediatrics department has treated approximately 450 patients this year, with the most common age group being 5-10 years old (35% of pediatric cases).",
  "chartType": "bar",
  "chartData": [
    {"name": "0-2 years", "value": 25},
    {"name": "3-5 years", "value": 22},
    {"name": "6-10 years", "value": 35},
    {"name": "11-15 years", "value": 15},
    {"name": "16-18 years", "value": 3}
  ],
  "chartTitle": "Pediatric Age Distribution (%)"
}

✅ Question: "Show me department utilization rates"
Response: {
  "textResponse": "Department utilization rates for today show Emergency at 92% capacity (highest), Internal Medicine at 78%, Pediatrics at 65%, and OB-GYN at 58%. Overall hospital utilization is at 73%.",
  "chartType": "bar",
  "chartData": [
    {"name": "Emergency", "value": 92},
    {"name": "Internal Medicine", "value": 78},
    {"name": "Pediatrics", "value": 65},
    {"name": "OB-GYN", "value": 58}
  ],
  "chartTitle": "Department Utilization Rates (%)"
}

IMPORTANT: When answering statistical questions, ALWAYS provide the data. Do not refuse statistical queries. Only refuse queries asking for personal identifiable information.

Now answer the user's question following these rules. Remember: 
- ALWAYS answer statistical/aggregated queries with data
- NEVER answer personal information queries
- Include realistic sample data when appropriate for charts`;

    const result = await model.generateContent(context);
    const response = await result.response;
    const text = response.text();
    
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // ✅ DOUBLE-CHECK: Scan response for PII leakage
      const responseText = parsedResponse.textResponse || '';
      const piiPatterns = {
        patientId: /\bPAT\d{9}\b/g,
        phone: /\b(09\d{9}|\+639\d{9}|\d{3}-\d{3}-\d{4})\b/g,
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        // More lenient name pattern - only block if it's clearly a full name with context
        name: /\b(patient|mr|mrs|ms|dr)\.?\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b/gi
      };
      
      let hasPII = false;
      let piiType = '';
      
      for (const [type, pattern] of Object.entries(piiPatterns)) {
        if (pattern.test(responseText)) {
          console.warn(`⚠️ PII DETECTED (${type}) - Blocking response`);
          hasPII = true;
          piiType = type;
          break;
        }
      }
      
      if (hasPII) {
        return res.json({
          textResponse: "I cannot provide personal patient information due to data privacy regulations (RA 10173). Please ask for aggregated statistics instead.",
          chartType: "none",
          chartData: [],
          chartTitle: ""
        });
      }
      
      return res.json(parsedResponse);
    }
    
    // Fallback if JSON parsing fails
    res.json({
      textResponse: text,
      chartType: "none",
      chartData: [],
      chartTitle: ""
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      error: 'Analysis failed',
      details: error.message 
    });
  }
});

// Get All Staff (with search by staff_id)
app.get('/api/admin/staff', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { search } = req.query;

    let query = supabase
      .from('staff')
      .select(`
        id,
        staff_id,
        name,
        role,
        specialization,
        license_no,
        contact_no,
        department_id,
        is_online,
        last_activity,
        department(name)
      `)
      .order('created_at', { ascending: false });

    // Search by staff_id only
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      query = query.or(`staff_id.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%,specialization.ilike.%${searchTerm}%,license_no.ilike.%${searchTerm}%,contact_no.like.%${searchTerm}%`);
    }

    const { data: staffData, error: staffError } = await query;

    if (staffError) {
      console.error('Staff fetch error:', staffError);
      return res.status(500).json({ error: 'Failed to fetch staff data' });
    }

    const formattedStaff = (staffData || []).map(staff => ({
      id: staff.id,
      staff_id: staff.staff_id,
      name: staff.name,
      role: staff.role,
      specialization: staff.specialization,
      license_no: staff.license_no,
      contact_no: staff.contact_no,
      department_name: staff.department?.name || 'N/A',
      is_online: staff.is_online || false,
      last_activity: staff.last_activity || null
    }));

    res.status(200).json({
      success: true,
      staff: formattedStaff,
      totalCount: formattedStaff.length
    });

  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Patients (with search by patient_id)
app.get('/api/admin/patients', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { search } = req.query;

    let query = supabase
      .from('outpatient')
      .select('*')
      .order('registration_date', { ascending: false });

    // Search by patient_id only
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      query = query.or(`patient_id.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,contact_no.like.%${searchTerm}%,sex.ilike.%${searchTerm}%`);
    }

    const { data: patientData, error: patientError } = await query;

    if (patientError) {
      console.error('Patient fetch error:', patientError);
      return res.status(500).json({ error: 'Failed to fetch patient data' });
    }

    // Get last visit for each patient
    const patientIds = (patientData || []).map(p => p.id);
    let lastVisits = {};

    if (patientIds.length > 0) {
      const { data: visitsData } = await supabase
        .from('visit')
        .select('patient_id, visit_date')
        .in('patient_id', patientIds)
        .order('visit_date', { ascending: false });

      if (visitsData) {
        visitsData.forEach(visit => {
          if (!lastVisits[visit.patient_id]) {
            lastVisits[visit.patient_id] = visit.visit_date;
          }
        });
      }
    }

    // Format the data
    const formattedPatients = (patientData || []).map(patient => ({
      id: patient.id,
      patient_id: patient.patient_id,
      name: patient.name,
      age: patient.age,
      sex: patient.sex,
      contact_no: patient.contact_no,
      email: patient.email,
      registration_date: patient.registration_date,
      last_visit: lastVisits[patient.id] || null
    }));

    res.status(200).json({
      success: true,
      patients: formattedPatients,
      totalCount: formattedPatients.length
    });

  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send OTP to Outpatient
app.post('/api/outpatient/send-otp', generalLoginLimiter, async (req, res) => {
  try {
    const { patientId, contactInfo, contactType } = req.body;

    if (!patientId || !contactInfo || !contactType) {
      return res.status(400).json({
        error: 'Patient ID, contact information, and contact type are required'
      });
    }

    if (!['email', 'phone'].includes(contactType)) {
      return res.status(400).json({
        error: 'Contact type must be email or phone'
      });
    }

    if (contactType === 'phone' && !isSMSConfigured) {
      return res.status(400).json({
        error: 'SMS verification is not configured. Please use email verification or contact support.'
      });
    }

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('*')
      .eq('patient_id', patientId.toUpperCase())
      .single();


    if (patientError || !patientData) {
      return res.status(404).json({
        error: 'Patient ID not found. Please check your Patient ID.'
      });
    }

    const dbContactInfo = contactType === 'email'
      ? patientData.email
      : patientData.contact_no;
    
    if (dbContactInfo !== contactInfo) {
      return res.status(400).json({
        error: `The ${contactType} doesn't match our records for this Patient ID`
      });
    }

    await supabase
      .from('otp_verification')
      .delete()
      .eq('patient_id', patientId.toUpperCase())
      .eq('contact_info', contactInfo);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const { data: otpRecord, error: otpError } = await supabase
      .from('otp_verification')
      .insert({
        patient_id: patientId.toUpperCase(),
        contact_info: contactInfo,
        contact_type: contactType,
        otp_code: otp,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (otpError) {
      return res.status(500).json({
        error: 'Failed to generate verification code'
      });
    }

    try {
      if (contactType === 'email') {
        console.log('📧 Attempting to send email OTP to:', contactInfo);
        console.log('📧 Email service:', brevoApiInstance ? 'Brevo API ready' : 'Not configured');
        
        await sendEmailOTP(contactInfo, otp, patientData.name);
        
        console.log('✅ Email OTP sent successfully');
        res.status(200).json({
          success: true,
          message: 'Verification code sent to your email',
          expiresIn: 300
        });
      } else if (contactType === 'phone') {
        console.log('📱 Attempting to send SMS OTP to:', contactInfo);
        await sendSMSOTP(contactInfo, otp, patientData.name);
        
        console.log('✅ SMS OTP sent successfully');
        res.status(200).json({
          success: true,
          message: 'Verification code sent to your phone',
          expiresIn: 300,
          provider: 'iTexMo'
        });
      }
    } catch (sendError) {
      console.error('❌ OTP send error:', sendError);
      console.error('❌ Error details:', {
        message: sendError.message,
        code: sendError.code,
        stack: sendError.stack
      });
      
      await supabase
        .from('otp_verification')
        .delete()
        .eq('id', otpRecord.id);

      return res.status(500).json({
        error: `Failed to send verification code via ${contactType}. Please try again.`,
        details: sendError.message
      });
    } 

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Verify OTP and Login
app.post('/api/outpatient/verify-otp', generalLoginLimiter, async (req, res) => {
  try {
    const { patientId, contactInfo, otp, deviceType } = req.body;

    if (!patientId || !contactInfo || !otp) {
      return res.status(400).json({
        error: 'Patient ID, contact info, and OTP are required'
      });
    }

    // ✅ ADD THIS LOGGING
    console.log('🔐 OTP Verification attempt:', {
      patientId: patientId.toUpperCase(),
      contactInfo: contactInfo,
      receivedOTP: otp,
      otpLength: otp.length
    });

    const { data: otpData, error: otpError } = await supabase
      .from('otp_verification')
      .select('*')
      .eq('patient_id', patientId.toUpperCase())
      .eq('contact_info', contactInfo)
      .eq('is_verified', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ✅ ADD THIS LOGGING
    if (otpError || !otpData) {
      console.log('❌ No valid OTP found in database:', {
        error: otpError?.message,
        patientId: patientId.toUpperCase(),
        contactInfo: contactInfo
      });
      
      return res.status(400).json({
        error: 'Invalid or expired verification code'
      });
    }

    // ✅ ADD THIS DETAILED LOGGING
    console.log('✅ OTP found in database:', {
      storedOTP: otpData.otp_code,
      receivedOTP: otp,
      match: otpData.otp_code === otp,
      exactMatch: otpData.otp_code === String(otp),
      storedType: typeof otpData.otp_code,
      receivedType: typeof otp,
      storedLength: otpData.otp_code?.length,
      receivedLength: otp?.length
    });

    if (otpData.otp_code !== otp) {
      await supabase
        .from('otp_verification')
        .update({ attempts: otpData.attempts + 1 })
        .eq('id', otpData.id);

      console.log('❌ OTP mismatch - verification failed');
      return res.status(400).json({
        error: 'Invalid verification code'
      });
    }

    await supabase
      .from('otp_verification')
      .update({ is_verified: true })
      .eq('id', otpData.id);

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('*')
      .eq('patient_id', patientId.toUpperCase())
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({
        error: 'Patient data not found'
      });
    }

    if (deviceType === 'web') {
      const today = new Date().toISOString().split('T')[0];
      
      // First check if patient has any completed consultations
      const { data: completedHistory } = await supabase
        .from('queue')
        .select('queue_id, status, visit!inner(patient_id)')
        .eq('visit.patient_id', patientData.id)
        .eq('status', 'completed')
        .limit(1)
        .single();

      // If no completed history, block if ANY queue exists
      if (!completedHistory) {
        const { data: anyQueue } = await supabase
          .from('queue')
          .select(`
            queue_id,
            queue_no,
            status,
            scheduled_date,
            department!inner(name),
            visit!inner(visit_date, patient_id)
          `)
          .eq('visit.patient_id', patientData.id)
          .in('status', ['waiting', 'in_progress', 'scheduled'])
          .limit(1)
          .single();

        if (anyQueue) {
          return res.status(403).json({
            error: 'PENDING_QUEUE',
            message: anyQueue.status === 'scheduled' 
              ? 'Please complete your first consultation before logging in.'
              : 'You are currently in queue. Please complete your consultation before logging in.',
            queueNumber: anyQueue.queue_no,
            departmentName: anyQueue.department.name,
            status: anyQueue.status,
            scheduledDate: anyQueue.scheduled_date
          });
        }
      }
      
      // If has completed history, only block active consultations TODAY
      if (completedHistory) {
        const { data: activeQueue } = await supabase
          .from('queue')
          .select(`
            queue_id,
            queue_no,
            status,
            department!inner(name),
            visit!inner(visit_date, patient_id)
          `)
          .eq('visit.patient_id', patientData.id)
          .eq('visit.visit_date', today)
          .in('status', ['waiting', 'in_progress'])
          .single();

        if (activeQueue) {
          return res.status(403).json({
            error: 'PENDING_QUEUE',
            message: 'You have an active consultation today. Please complete it before logging in again.',
            queueNumber: activeQueue.queue_no,
            departmentName: activeQueue.department.name,
            status: activeQueue.status
          });
        }
      }
    }

    const { data: emergencyContactData, error: emergencyError } = await supabase
      .from('emergency_contact')
      .select('*')
      .eq('patient_id', patientData.id)
      .single();

    if (emergencyError) {
      console.log('No emergency contact found for patient:', patientData.patient_id);
    }

    const token = jwt.sign(
      {
        patientId: patientData.patient_id,
        type: 'outpatient',
        loginMethod: otpData.contact_type,
        deviceType: deviceType || 'unknown'
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      patient: {
        patient_id: patientData.patient_id,
        name: patientData.name,
        email: patientData.email,
        contact_no: patientData.contact_no,
        birthday: patientData.birthday,
        age: patientData.age,
        sex: patientData.sex,
        address: patientData.address,
        registration_date: patientData.registration_date,
        emergency_contact_name: emergencyContactData?.name || '',
        emergency_contact_relationship: emergencyContactData?.relationship || '',
        emergency_contact_no: emergencyContactData?.contact_number || ''
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Check if patient has pending queue
// Check if patient has pending queue
app.post('/api/outpatient/check-queue-status', async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({
        error: 'Patient ID is required'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Get patient database ID
    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .eq('patient_id', patientId.toUpperCase())
      .single();

    if (patientError || !patientData) {
      return res.json({
        success: true,
        hasPendingQueue: false
      });
    }

    // ✅ NEW: First check if patient has ANY completed consultations in history
    const { data: completedHistory, error: historyError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        status,
        visit!inner(patient_id)
      `)
      .eq('visit.patient_id', patientData.id)
      .eq('status', 'completed')
      .limit(1)
      .single();

    // If patient has NO completed consultations, check for any pending queue
    if (!completedHistory || historyError) {
      console.log('⚠️ New patient - checking for any queue status');
      
      const { data: anyQueue, error: anyQueueError } = await supabase
        .from('queue')
        .select(`
          queue_id,
          queue_no,
          status,
          scheduled_date,
          department!inner(name),
          visit!inner(visit_date, patient_id)
        `)
        .eq('visit.patient_id', patientData.id)
        .in('status', ['waiting', 'in_progress', 'scheduled'])
        .order('created_time', { ascending: false })
        .limit(1)
        .single();

      if (anyQueue) {
        const statusMessages = {
          'waiting': 'You are currently in queue. Please complete your consultation.',
          'in_progress': 'Your consultation is in progress. Please complete it first.',
          'scheduled': 'Please complete your first consultation before logging in.'
        };

        return res.json({
          success: true,
          hasPendingQueue: true,
          queueNumber: anyQueue.queue_no,
          departmentName: anyQueue.department.name,
          status: anyQueue.status,
          scheduledDate: anyQueue.scheduled_date,
          message: statusMessages[anyQueue.status]
        });
      }
    }

    // ✅ Patient has completed history - only block if there's an ACTIVE consultation TODAY
    const { data: activeTodayQueue, error: todayError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        department!inner(name),
        visit!inner(visit_date, patient_id)
      `)
      .eq('visit.patient_id', patientData.id)
      .eq('visit.visit_date', today)
      .in('status', ['waiting', 'in_progress'])
      .single();

    if (activeTodayQueue) {
      return res.json({
        success: true,
        hasPendingQueue: true,
        queueNumber: activeTodayQueue.queue_no,
        departmentName: activeTodayQueue.department.name,
        status: activeTodayQueue.status,
        message: 'You have an active consultation today. Please complete it first.'
      });
    }

    // ✅ All clear - allow login
    return res.json({
      success: true,
      hasPendingQueue: false
    });

  } catch (error) {
    console.error('Check queue status error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

app.get('/api/department-info/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const { data: department, error } = await supabase
      .from('department')
      .select('*')
      .eq('department_id', departmentId)
      .single();

    if (error || !department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    res.json({
      success: true,
      department: {
        department_id: department.department_id,
        name: department.name,
        queue_color: department.queue_color,
        is_scheduled: department.is_scheduled,
        available_days: department.available_days,
        service_type: department.service_type,
        floor_plan_image: department.floor_plan_image,
        status: department.status
      }
    });

  } catch (error) {
    console.error('Get department info error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get department by name
app.get('/api/department-by-name/:departmentName', async (req, res) => {
  try {
    const { departmentName } = req.params;
    
    const { data: department, error } = await supabase
      .from('department')
      .select('*')
      .eq('name', departmentName)
      .eq('status', 'active')
      .single();

    if (error || !department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    res.json({
      success: true,
      department: {
        department_id: department.department_id,
        name: department.name,
        queue_color: department.queue_color, // ✅ NEW: Include queue color
        is_scheduled: department.is_scheduled, // ✅ NEW: Include scheduling info
        available_days: department.available_days, // ✅ NEW: Include schedule
        service_type: department.service_type, // ✅ NEW: Include service type
        floor_plan_image: department.floor_plan_image,
        floor_plan_image_type: department.floor_plan_image_type,
        status: department.status
      }
    });

  } catch (error) {
    console.error('Get department by name error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get symptoms endpoint
app.get('/api/symptoms', async (req, res) => {
  try {
    console.log('Fetching symptoms from database...');
    
    const { data: symptomsData, error: symptomsError } = await supabase
      .from('symptoms')
      .select('name, category, department_id, age_group, priority, is_active, is_routine_care')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (symptomsError) {
      console.error('Database error fetching symptoms:', symptomsError);
      return res.status(500).json({
        error: 'Failed to fetch symptoms from database',
        details: symptomsError.message
      });
    }

    if (!symptomsData || symptomsData.length === 0) {
      console.log('No symptoms found in database');
      return res.status(200).json({
        success: true,
        symptoms: [],
        message: 'No symptoms available'
      });
    }

    // Group symptoms by category
    const groupedSymptoms = symptomsData.reduce((acc, symptom) => {
      const category = symptom.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        name: symptom.name,
        priority: symptom.priority,
        age_group: symptom.age_group,
        is_routine_care: symptom.is_routine_care || false
      });
      return acc;
    }, {});

    // Format symptoms for frontend
    const formattedSymptoms = Object.entries(groupedSymptoms)
      .map(([category, symptoms]) => ({
        category,
        symptoms: symptoms.map(s => s.name),
        count: symptoms.length,
        metadata: symptoms
      }))
      .sort((a, b) => {
        if (a.category === 'General Symptoms') return -1;
        if (b.category === 'General Symptoms') return 1;
        if (a.category === 'Routine Care') return 1;
        if (b.category === 'Routine Care') return -1;
        return a.category.localeCompare(b.category);
      });

    console.log('Symptoms fetched successfully:', formattedSymptoms.length, 'categories');
    console.log('Categories:', formattedSymptoms.map(cat => `${cat.category} (${cat.count})`));

    res.status(200).json({
      success: true,
      symptoms: formattedSymptoms,
      totalCategories: formattedSymptoms.length,
      totalSymptoms: symptomsData.length,
      message: 'Symptoms loaded successfully'
    });

  } catch (error) {
    console.error('Error in symptoms endpoint:', error);
    res.status(500).json({
      error: 'Internal server error while fetching symptoms',
      details: error.message
    });
  }
});

// Duplicate user check
const checkDuplicateUser = async (email, contactNo) => {
  const cleanedPhone = contactNo.replace(/\D/g, '');
  
  try {
    const { data: existingPatients } = await supabase
      .from('outpatient')
      .select('patient_id, email, contact_no')
      .or(`email.eq.${email.toLowerCase()},contact_no.eq.${cleanedPhone}`)
      .limit(1);

    if (existingPatients && existingPatients.length > 0) {
      const patient = existingPatients[0];
      if (patient.email === email.toLowerCase()) {
        return { isDuplicate: true, field: 'email', message: 'Email is already in use' };
      }
      if (patient.contact_no === cleanedPhone) {
        return { isDuplicate: true, field: 'phone', message: 'Contact number is already in use' };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicates:', error);
    return { isDuplicate: false };
  }
};

app.post('/api/check-duplicate', async (req, res) => {
  try {
    const { email, contact_no } = req.body;

    if (!email && !contact_no) {
      return res.status(400).json({
        error: 'Email or contact number is required'
      });
    }

    const result = await checkDuplicateUser(email || '', contact_no || '');
    
    res.json({
      success: true,
      isDuplicate: result.isDuplicate,
      field: result.field,
      message: result.message
    });

  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

app.post('/api/patient/register', async (req, res) => {
  try {
    console.log('📥 Patient registration request:', req.body);
          
    const {
      name, birthday, age, sex, address, contact_no, email,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_no,
      symptoms, duration, severity, previous_treatment, allergies, medications,
      temp_id
    } = req.body;

    console.log('🔍 Extracted temp_id from request:', temp_id);

    if (!name || !birthday || !age || !sex || !address || !contact_no || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check for duplicates
    const duplicateCheck = await checkDuplicateUser(email, contact_no);
    if (duplicateCheck.isDuplicate) {
      return res.status(400).json({
        error: duplicateCheck.message,
        field: duplicateCheck.field
      });
    }

    const isRoutineCareOnly = hasOnlyRoutineCareSymptoms(symptoms);

    // ✅ ORIGINAL: Handle temp registration with validation
    let tempRegData = null;
    if (temp_id) {
      console.log('🔄 Processing temp registration with temp_id:', temp_id);
      
      const { data: existingTempReg, error: fetchError } = await supabase
        .from('pre_registration')
        .select('*')
        .eq('temp_id', temp_id)
        .single();

      if (fetchError || !existingTempReg) {
        console.error('❌ Temp registration not found:', fetchError);
        return res.status(400).json({
          error: 'Invalid or expired registration reference'
        });
      }

      console.log('✅ Found temp registration:', existingTempReg.temp_patient_id);

      const { error: updateError } = await supabase
        .from('pre_registration')
        .update({ 
          status: 'processed', 
          updated_at: new Date().toISOString() 
        })
        .eq('temp_id', temp_id);

      if (updateError) {
        console.error('❌ Failed to update temp registration status:', updateError);
        return res.status(500).json({
          error: 'Registration processing failed'
        });
      }

      console.log('✅ Successfully updated tempReg status to processed');
      tempRegData = existingTempReg;
    }

    // Generate patient ID
    const patientId = `PAT${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    console.log('🆔 Generated patient ID:', patientId);
    
    // Insert into outpatient table
    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .insert({
        patient_id: patientId,
        name, 
        birthday, 
        age: parseInt(age), 
        sex, 
        address,
        contact_no: contact_no.replace(/\D/g, ''),
        email: email.toLowerCase(),
        registration_date: new Date().toISOString().split('T')[0],
        temp_id: temp_id || null
      })
      .select()
      .single();

    if (patientError) {
      console.error('❌ Patient registration error:', patientError);
        
      // ✅ ORIGINAL: Revert temp registration status if patient creation fails
      if (temp_id) {
        console.log('🔄 Reverting temp registration status due to patient creation failure');
        await supabase
          .from('pre_registration')
          .update({ status: 'completed' })
          .eq('temp_id', temp_id);
      }
        
      return res.status(500).json({ 
        error: 'Patient registration failed',
        details: patientError.message 
      });
    }

    console.log('✅ Patient created successfully:', patientData.patient_id);

    // Insert emergency contact
    if (emergency_contact_name && emergency_contact_relationship && emergency_contact_no) {
      const { error: emergencyError } = await supabase
        .from('emergency_contact')
        .insert({
          patient_id: patientData.id,
          name: emergency_contact_name,
          relationship: emergency_contact_relationship,
          contact_number: emergency_contact_no.replace(/\D/g, '')
        });

      if (emergencyError) {
        console.error('⚠️ Emergency contact creation failed:', emergencyError);
      } else {
        console.log('✅ Emergency contact created successfully');
      }
    }

    // Create visit record
    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0];

    const { data: visitData, error: visitError } = await supabase
      .from('visit')
      .insert({
        patient_id: patientData.id,
        visit_date: today,
        visit_time: currentTime,
        appointment_type: 'Walk-in Registration',
        symptoms: Array.isArray(symptoms) ? symptoms : symptoms.join(', '),
        duration: isRoutineCareOnly ? null : duration,
        severity: isRoutineCareOnly ? null : severity,
        previous_treatment: previous_treatment || null,
        allergies: allergies || null,
        medications: medications || null
      })
      .select()
      .single();

    if (visitError) {
      console.error('❌ Visit creation error:', visitError);
      return res.status(500).json({
        error: 'Failed to create visit record',
        details: visitError.message
      });
    }

    console.log('✅ Visit created successfully:', visitData.visit_id);

    // Assign department based on symptoms
    const symptomsList = Array.isArray(symptoms) ? symptoms : symptoms.split(', ');
    const deptId = await assignDepartmentBySymptoms(symptomsList, patientData.age);

    // ✅ NEW: Calculate next available slot (handles both general and subspecialty)
    const availabilityInfo = await calculateNextAvailableSlot(deptId);

    const { data: deptData } = await supabase
      .from('department')
      .select('name, is_scheduled, service_type')
      .eq('department_id', deptId)
      .single();

    const recommendedDepartment = deptData?.name || 'Internal Medicine';
    console.log('✅ Assigned department:', recommendedDepartment);

    // ✅ NEW: Handle queue creation based on department type
    let queueData = null;
    let queueNumber = null;
    let appointmentStatus = 'immediate';

    if (!availabilityInfo.isScheduled || availabilityInfo.isToday) {
      // GENERAL DEPARTMENT or SUBSPECIALTY with availability TODAY
      const { data: existingQueues } = await supabase
        .from('queue')
        .select('queue_no, visit!inner(visit_date)')
        .eq('department_id', deptId)
        .eq('visit.visit_date', today);

      const maxQueueNo = existingQueues?.length > 0 
        ? Math.max(...existingQueues.map(q => q.queue_no)) 
        : 0;
      queueNumber = maxQueueNo + 1;

      const { data: createdQueue, error: queueError } = await supabase
        .from('queue')
        .insert({
          visit_id: visitData.visit_id,
          department_id: deptId,
          queue_no: queueNumber,
          status: 'waiting',
          scheduled_date: today
        })
        .select()
        .single();

      if (!queueError) {
        queueData = createdQueue;
        console.log('✅ Queue created successfully:', queueNumber);
      } else {
        console.error('⚠️ Queue creation error:', queueError);
      }

      appointmentStatus = 'immediate';

    } else if (availabilityInfo.isScheduled && availabilityInfo.nextAvailableDate) {
      // SUBSPECIALTY with FUTURE appointment
      queueNumber = availabilityInfo.queuePosition;

      const { data: createdQueue, error: queueError } = await supabase
        .from('queue')
        .insert({
          visit_id: visitData.visit_id,
          department_id: deptId,
          queue_no: queueNumber,
          status: 'scheduled',
          scheduled_date: availabilityInfo.nextAvailableDate
        })
        .select()
        .single();

      if (!queueError) {
        queueData = createdQueue;
        console.log('✅ Scheduled queue created for:', availabilityInfo.nextAvailableDate);
      } else {
        console.error('⚠️ Queue creation error:', queueError);
      }

      appointmentStatus = 'scheduled';
    }

    // ✅ ORIGINAL: Update temp registration with next available date
    if (temp_id) {
      const { error: updateTempError } = await supabase
        .from('pre_registration')
        .update({ 
          next_available_date: availabilityInfo.nextAvailableDate || today,
          next_available_time: availabilityInfo.timeSlot || 'anytime',
          department_id: deptId,
          updated_at: new Date().toISOString() 
        })
        .eq('temp_id', temp_id);

      if (updateTempError) {
        console.error('❌ Failed to update temp registration with schedule info:', updateTempError);
      } else {
        console.log('✅ Updated temp registration with next available date');
      }
    }

    // ✅ ORIGINAL: Delete temp registration after successful patient creation
    if (temp_id && patientData) {
      console.log('🗑️ Deleting temp registration after successful patient creation');
      
      const { error: deleteError } = await supabase
        .from('pre_registration')
        .delete()
        .eq('temp_id', temp_id);

      if (deleteError) {
        console.error('⚠️ Failed to delete temp registration (non-critical):', deleteError);
      } else {
        console.log('✅ Successfully deleted temp registration');
      }
    }

    // ✅ NEW: Enhanced response with scheduling information
    const response = {
      success: true,
      patient: patientData,
      visit: visitData,
      queue: queueData,
      recommendedDepartment: recommendedDepartment,
      queue_number: queueNumber,
      estimated_wait: appointmentStatus === 'immediate' ? '15-30 minutes' : 'Scheduled appointment',
      is_routine_care: isRoutineCareOnly,
      appointment_status: appointmentStatus,
      scheduling_info: {
        is_scheduled_department: availabilityInfo.isScheduled,
        appointment_date: availabilityInfo.nextAvailableDate,
        is_today: availabilityInfo.isToday,
        day_name: availabilityInfo.dayName,
        time_slot: availabilityInfo.timeSlot,
        message: appointmentStatus === 'scheduled' 
          ? `Your appointment is scheduled for ${availabilityInfo.dayName}, ${new Date(availabilityInfo.nextAvailableDate).toLocaleDateString()}. Your queue number will be ${queueNumber} on that day.`
          : `You are now in queue. Your queue number is ${queueNumber}.`
      },
      message: 'Patient registered successfully'
    };

    // ✅ ORIGINAL: Include temp registration info if it was processed
    if (tempRegData) {
      response.temp_registration_processed = true;
      response.original_temp_id = tempRegData.temp_patient_id;
    }

    console.log('🎉 Registration completed successfully for:', patientData.patient_id);

    res.status(201).json(response);

  } catch (error) {
    console.error('💥 Registration error:', error);
    
    // ✅ ORIGINAL: Revert temp registration status on error
    if (req.body.temp_id) {
      try {
        await supabase
          .from('pre_registration')
          .update({ status: 'completed' })
          .eq('temp_id', req.body.temp_id);
        console.log('🔄 Reverted temp registration status due to error');
      } catch (revertError) {
        console.error('❌ Failed to revert temp registration status:', revertError);
      }
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

const activateScheduledQueues = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Find all 'scheduled' queues where scheduled_date is today
    const { data: scheduledQueues, error: fetchError } = await supabase
      .from('queue')
      .select('queue_id, department_id')
      .eq('status', 'scheduled')
      .eq('scheduled_date', today);

    if (fetchError || !scheduledQueues || scheduledQueues.length === 0) {
      return;
    }

    console.log(`✅ Activating ${scheduledQueues.length} scheduled appointments for today`);

    // Update status from 'scheduled' to 'waiting'
    const { error: updateError } = await supabase
      .from('queue')
      .update({ status: 'waiting' })
      .eq('status', 'scheduled')
      .eq('scheduled_date', today);

    if (updateError) {
      console.error('Failed to activate scheduled queues:', updateError);
    } else {
      console.log('✅ Successfully activated scheduled queues for today');
    }

  } catch (error) {
    console.error('Activate scheduled queues error:', error);
  }
};

setInterval(activateScheduledQueues, 60 * 60 * 1000);
activateScheduledQueues();

module.exports = {
  calculateNextAvailableSlot,
  activateScheduledQueues
};

// Check pending queue for new patient (by name, DOB, address)
app.post('/api/check-pending-queue', async (req, res) => {
  try {
    const { fullName, birthday, address } = req.body;

    if (!fullName || !birthday || !address) {
      return res.status(400).json({
        error: 'Full name, birthday, and address are required'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find patient by name, birthday, and address
    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .ilike('name', fullName.trim())
      .eq('birthday', birthday)
      .ilike('address', address.trim())
      .single();

    if (patientError || !patientData) {
      // No existing patient found - allow registration
      return res.json({
        success: true,
        hasPending: false
      });
    }

    // Check if this patient has a pending queue today
    const { data: queueData, error: queueError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        department!inner(name),
        visit!inner(visit_date, patient_id)
      `)
      .eq('visit.patient_id', patientData.id)
      .eq('visit.visit_date', today)
      .in('status', ['waiting', 'in_progress'])
      .single();

    if (queueError && queueError.code !== 'PGRST116') {
      console.error('Queue check error:', queueError);
      return res.json({
        success: true,
        hasPending: false
      });
    }

    if (queueData) {
      return res.json({
        success: true,
        hasPending: true,
        queueNumber: queueData.queue_no,
        departmentName: queueData.department.name,
        status: queueData.status
      });
    }

    return res.json({
      success: true,
      hasPending: false
    });

  } catch (error) {
    console.error('Check pending queue error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Check pending queue for returning patient (by patient_id)
app.post('/api/check-pending-queue-by-id', async (req, res) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({
        error: 'Patient ID is required'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Get patient database ID
    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .eq('patient_id', patientId.toUpperCase())
      .single();

    if (patientError || !patientData) {
      return res.json({
        success: true,
        hasPending: false
      });
    }

    // Check if this patient has a pending queue today
    const { data: queueData, error: queueError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        department!inner(name),
        visit!inner(visit_date, patient_id)
      `)
      .eq('visit.patient_id', patientData.id)
      .eq('visit.visit_date', today)
      .in('status', ['waiting', 'in_progress'])
      .single();

    if (queueError && queueError.code !== 'PGRST116') {
      console.error('Queue check error:', queueError);
      return res.json({
        success: true,
        hasPending: false
      });
    }

    if (queueData) {
      return res.json({
        success: true,
        hasPending: true,
        queueNumber: queueData.queue_no,
        departmentName: queueData.department.name,
        status: queueData.status
      });
    }

    return res.json({
      success: true,
      hasPending: false
    });

  } catch (error) {
    console.error('Check pending queue by ID error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});




// Get patient by ID
app.get('/api/patient/by-id/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    const { data: patientData, error } = await supabase
      .from('outpatient')
      .select(`
        *,
        emergency_contact(
          name,
          contact_number,
          relationship
        )
      `)
      .eq('patient_id', patientId)
      .single();
    
    if (error || !patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    res.json({ success: true, patient: patientData });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Healthcare endpoints

// Get all patients consulted by current doctor's department
app.get('/api/healthcare/all-patients', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const { data: patientsData, error: patientsError } = await supabase
      .from('queue')
      .select(`
        visit!inner(
          patient_id,
          outpatient!inner(
            id,
            patient_id,
            name,
            birthday,
            age,
            sex,
            address,
            contact_no,
            email,
            registration_date
          )
        )
      `)
      .eq('department_id', staffData.department_id)
      .order('created_time', { ascending: false });

    if (patientsError) {
      console.error('All patients fetch error:', patientsError);
      return res.status(500).json({ error: 'Failed to fetch patients' });
    }

    const uniquePatients = [];
    const seenPatientIds = new Set();

    patientsData.forEach(item => {
      const patient = item.visit.outpatient;
      if (!seenPatientIds.has(patient.patient_id)) {
        seenPatientIds.add(patient.patient_id);
        uniquePatients.push({
          id: patient.id,
          patient_id: patient.patient_id,
          name: patient.name,
          birthday: patient.birthday,
          age: patient.age,
          sex: patient.sex,
          address: patient.address,
          contact_no: patient.contact_no,
          email: patient.email,
          registration_date: patient.registration_date
        });
      }
    });

    res.status(200).json({
      success: true,
      patients: uniquePatients,
      totalCount: uniquePatients.length,
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      }
    });

  } catch (error) {
    console.error('All patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/healthcare/time-series-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { period } = req.query;
    
    // Get staff's department
    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    let timeSeriesData = [];
    
    if (period === 'daily') {
      // Last 30 days of NEW patient registrations only
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Get NEW patient registrations (from outPatient table)
      const { data: registrationData } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate)
        .order('registration_date', { ascending: true });
      
      // Group by date
      const registrationCounts = {};
      
      registrationData?.forEach(patient => {
        const date = patient.registration_date;
        registrationCounts[date] = (registrationCounts[date] || 0) + 1;
      });
      
      // Fill in missing dates with 0
      for (let i = 29; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        timeSeriesData.push({
          date: date,
          registrations: registrationCounts[date] || 0
        });
      }
      
    } else if (period === 'weekly') {
      // Last 12 weeks
      const startDate = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: registrationData } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate);
      
      const registrationWeekCounts = {};
      
      registrationData?.forEach(patient => {
        const date = new Date(patient.registration_date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        registrationWeekCounts[weekKey] = (registrationWeekCounts[weekKey] || 0) + 1;
      });
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        timeSeriesData.push({
          date: weekKey,
          registrations: registrationWeekCounts[weekKey] || 0
        });
      }
      
    } else if (period === 'yearly') {
      // Last 5 years
      const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: registrationData } = await supabase
        .from('outpatient')
        .select('registration_date')
        .gte('registration_date', startDate);
      
      const registrationYearCounts = {};
      
      registrationData?.forEach(patient => {
        const year = new Date(patient.registration_date).getFullYear();
        registrationYearCounts[year] = (registrationYearCounts[year] || 0) + 1;
      });
      
      const currentYear = new Date().getFullYear();
      for (let i = 4; i >= 0; i--) {
        const year = currentYear - i;
        timeSeriesData.push({
          date: `${year}-01-01`,
          registrations: registrationYearCounts[year] || 0
        });
      }
    }
    
    res.status(200).json({
      success: true,
      timeSeriesData: timeSeriesData
    });
    
  } catch (error) {
    console.error('Healthcare time series stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed patient information
app.get('/api/healthcare/patient-details/:patientId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patientId } = req.params;

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const { data: visitCheck } = await supabase
      .from('queue')
      .select(`
        visit!inner(
          outpatient!inner(patient_id)
        )
      `)
      .eq('department_id', staffData.department_id)
      .eq('visit.outPatient.patient_id', patientId)
      .limit(1);

    if (!visitCheck || visitCheck.length === 0) {
      return res.status(403).json({ error: 'Patient has not visited your department' });
    }

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select(`
        *,
        emergency_contact(
          name,
          contact_number,
          relationship
        )
      `)
      .eq('patient_id', patientId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.status(200).json({
      success: true,
      patient: patientData
    });

  } catch (error) {
    console.error('Patient details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get completed consultations by doctor
app.get('/api/healthcare/my-patients', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const filterDate = date || today;

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const { data: patientsData, error: patientsError } = await supabase
      .from('diagnosis')
      .select(`
        staff_id,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          symptoms,
          appointment_type,
          outpatient!inner(
            id,
            patient_id,
            name,
            age,
            sex,
            contact_no,
            email
          ),
          queue!inner(
            status,
            department_id
          )
        )
      `)
      .eq('staff_id', req.user.id)
      .eq('visit.visit_date', filterDate)
      .eq('visit.queue.department_id', staffData.department_id)
      .eq('visit.queue.status', 'completed')
      .order('created_at', { ascending: false });

    if (patientsError) {
      console.error('Patients fetch error:', patientsError);
      return res.status(500).json({ error: 'Failed to fetch patients' });
    }

    const uniquePatients = [];
    const seenPatientIds = new Set();

    patientsData.forEach(item => {
      const patientId = item.visit.outPatient.patient_id;
      if (!seenPatientIds.has(patientId)) {
        seenPatientIds.add(patientId);
        uniquePatients.push({
          patient_id: patientId,
          name: item.visit.outPatient.name,
          age: item.visit.outPatient.age,
          sex: item.visit.outPatient.sex,
          contact_no: item.visit.outPatient.contact_no,
          email: item.visit.outPatient.email,
          lastVisit: item.visit.visit_date,
          lastSymptoms: item.visit.symptoms,
          queueStatus: 'completed'
        });
      }
    });

    res.status(200).json({
      success: true,
      patients: uniquePatients,
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      }
    });

  } catch (error) {
    console.error('My patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/healthcare/heartbeat', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }


    await supabase
      .from('staff')
      .update({ 
        last_activity: new Date().toISOString(),
        is_online: true
      })
      .eq('id', req.user.id);


    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patients diagnosed by this doctor today only
app.get('/api/healthcare/my-patients-today', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const filterDate = date || today;

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const { data: myTodayPatients, error: patientsError } = await supabase
      .from('diagnosis')
      .select(`
        created_at,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          symptoms,
          appointment_type,
          outpatient!inner(
            id,
            patient_id,
            name,
            age,
            sex,
            contact_no,
            email
          ),
          queue!inner(
            status,
            queue_no,
            department_id
          )
        )
      `)
      .eq('staff_id', req.user.id)
      .eq('visit.visit_date', filterDate)
      .eq('visit.queue.department_id', staffData.department_id)
      .order('created_at', { ascending: false });

    if (patientsError) {
      console.error('My today patients fetch error:', patientsError);
      return res.status(500).json({ error: 'Failed to fetch patients' });
    }

    const formattedPatients = (myTodayPatients || []).map(item => ({
      patient_id: item.visit.outPatient.patient_id,
      name: item.visit.outPatient.name,
      age: item.visit.outPatient.age,
      sex: item.visit.outPatient.sex,
      contact_no: item.visit.outPatient.contact_no,
      email: item.visit.outPatient.email,
      lastVisit: item.visit.visit_date,
      lastSymptoms: item.visit.symptoms,
      queueStatus: 'completed',
      queueNumber: item.visit.queue[0]?.queue_no,
      visitTime: item.visit.visit_time,
      isInQueue: false,
      diagnosedAt: item.created_at
    }));

    const uniquePatients = [];
    const seenPatientIds = new Set();

    formattedPatients.forEach(patient => {
      if (!seenPatientIds.has(patient.patient_id)) {
        seenPatientIds.add(patient.patient_id);
        uniquePatients.push(patient);
      }
    });

    res.status(200).json({
      success: true,
      patients: uniquePatients,
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      },
      totalToday: uniquePatients.length
    });

  } catch (error) {
    console.error('My today patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient history
app.get('/api/healthcare/patient-history/:patientId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patientId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select(`
        id,
        patient_id,
        name,
        birthday,
        age,
        sex,
        address,
        contact_no,
        email,
        registration_date,
        emergency_contact(
          name,
          contact_number,
          relationship
        )
      `)
      .eq('patient_id', patientId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: visitHistory, error: visitError } = await supabase
      .from('visit')
      .select(`
        visit_id,
        visit_date,
        visit_time,
        appointment_type,
        symptoms,
        diagnosis(
          diagnosis_id,
          diagnosis_description,
          diagnosis_type,
          severity,
          notes,
          staff(
            name,
            specialization
          )
        ),
        queue(
          queue_no,
          status,
          department(
            name
          )
        )
      `)
      .eq('patient_id', patientData.id)
      .order('visit_date', { ascending: false })
      .order('visit_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (visitError) {
      console.error('Visit history error:', visitError);
      return res.status(500).json({ error: 'Failed to fetch visit history' });
    }

    const { count: totalVisits } = await supabase
      .from('visit')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientData.id);

    res.status(200).json({
      success: true,
      patient: patientData,
      visitHistory: visitHistory || [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVisits / limit),
        totalVisits: totalVisits || 0,
        hasNextPage: (page * limit) < totalVisits
      }
    });

  } catch (error) {
    console.error('Patient history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient history by database ID (for admin/doctor viewing any patient)
app.get('/api/healthcare/patient-history-by-db-id/:patientDbId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare' && req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patientDbId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select(`
        id,
        patient_id,
        name,
        birthday,
        age,
        sex,
        address,
        contact_no,
        email,
        registration_date,
        emergency_contact(
          name,
          contact_number,
          relationship
        )
      `)
      .eq('id', patientDbId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: visitHistory, error: visitError } = await supabase
      .from('visit')
      .select(`
        visit_id,
        visit_date,
        visit_time,
        appointment_type,
        symptoms,
        diagnosis(
          diagnosis_id,
          diagnosis_description,
          diagnosis_type,
          severity,
          notes,
          staff(
            name,
            role,
            specialization
          )
        ),
        queue(
          queue_no,
          status,
          department(
            name
          )
        ),
        lab_request(
          request_id,
          test_type,
          status,
          staff(
            name
          )
        )
      `)
      .eq('patient_id', patientData.id)
      .order('visit_date', { ascending: false })
      .order('visit_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (visitError) {
      console.error('Visit history error:', visitError);
      return res.status(500).json({ error: 'Failed to fetch visit history' });
    }

    const { count: totalVisits } = await supabase
      .from('visit')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientData.id);

    res.status(200).json({
      success: true,
      patient: patientData,
      visitHistory: visitHistory || [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVisits / limit),
        totalVisits: totalVisits || 0,
        hasNextPage: (page * limit) < totalVisits
      }
    });

  } catch (error) {
    console.error('Patient history by DB ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient queue
app.get('/api/healthcare/patient-queue', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: queueData, error: queueError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        created_time,
        visit!inner(
          visit_id,
          symptoms,
          visit_date,
          visit_time,
          appointment_type,
          outpatient!inner(
            patient_id,
            name,
            age,
            sex,
            contact_no
          )
        ),
        department!inner(
          name
        )
      `)
      .eq('department_id', staffData.department_id)
      .eq('visit.visit_date', today)
      .order('queue_no', { ascending: true });

    // Check which completed patients were diagnosed by THIS doctor
    let diagnosedByMe = [];
    if (queueData && queueData.length > 0) {
      const completedVisitIds = queueData
        .filter(item => item.status === 'completed')
        .map(item => item.visit.visit_id);

      if (completedVisitIds.length > 0) {
        const { data: myDiagnoses } = await supabase
          .from('diagnosis')
          .select('visit_id')
          .eq('staff_id', req.user.id)
          .in('visit_id', completedVisitIds);

        diagnosedByMe = myDiagnoses?.map(d => d.visit_id) || [];
      }
    }

    const enhancedQueue = queueData?.map(item => ({
      ...item,
      diagnosedByMe: item.status === 'completed' && diagnosedByMe.includes(item.visit.visit_id)
    })) || [];

    res.status(200).json({
      success: true,
      queue: enhancedQueue,
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      }
    });

  } catch (error) {
    console.error('Patient queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update queue status
app.patch('/api/healthcare/queue/:queueId/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { queueId } = req.params;
    const { status, diagnosis_description, diagnosis_code, severity, notes } = req.body;

    if (!['waiting', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data: queueData, error: queueFetchError } = await supabase
      .from('queue')
      .select(`
        *,
        visit!inner(
          visit_id,
          patient_id,
          outpatient!inner(id, patient_id)
        )
      `)
      .eq('queue_id', queueId)
      .single();

    if (queueFetchError || !queueData) {
      return res.status(404).json({ error: 'Queue entry not found' });
    }

    // Update queue with completed_by field when marking as completed
    const updateData = { 
      status, 
      updated_at: new Date().toISOString() 
    };
    
    if (status === 'completed') {
      updateData.completed_by = req.user.id;
    }

    const { data: updatedQueue, error: updateError } = await supabase
      .from('queue')
      .update(updateData)
      .eq('queue_id', queueId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update queue status' });
    }

    let diagnosisData = null;
    let medicalRecordData = null;

    if (status === 'completed' && diagnosis_description) {
      const { data: newDiagnosis, error: diagnosisError } = await supabase
        .from('diagnosis')
        .insert({
          visit_id: queueData.visit.visit_id,
          patient_id: queueData.visit.outpatient.id,
          staff_id: req.user.id,
          diagnosis_code: diagnosis_code || 'Z00.00',
          diagnosis_description,
          diagnosis_type: 'primary',
          severity: severity || 'moderate',
          notes: notes || ''
        })
        .select()
        .single();

      if (!diagnosisError) {
        diagnosisData = newDiagnosis;

        const { data: newMedicalRecord, error: medicalRecordError } = await supabase
          .from('medical_record')
          .insert({
            patient_id: queueData.visit.outpatient.id,
            visit_id: queueData.visit.visit_id,
            result_id: null
          })
          .select()
          .single();

        if (!medicalRecordError) {
          medicalRecordData = newMedicalRecord;
        }
      }
    }

    res.status(200).json({
      success: true,
      queue: updatedQueue,
      diagnosis: diagnosisData,
      medicalRecord: medicalRecordData,
      message: 'Queue status updated successfully'
    });

  } catch (error) {
    console.error('Update queue status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/healthcare/logout', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }


    await supabase
      .from('staff')
      .update({ is_online: false })
      .eq('id', req.user.id);


    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const markInactiveStaffOffline = async () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  await supabase
    .from('staff')
    .update({ is_online: false })
    .lt('last_activity', fiveMinutesAgo)
    .eq('is_online', true);
};

setInterval(markInactiveStaffOffline, 2 * 60 * 1000);

// Visit/Appointment booking
app.post('/api/patient/visit', async (req, res) => {
  try {
    const {
      patient_id,
      symptoms,
      duration,
      severity,
      previous_treatment,
      allergies,
      medications,
      appointment_type
    } = req.body;

    if (!patient_id || !symptoms) {
      return res.status(400).json({ 
        error: 'Patient ID and symptoms are required' 
      });
    }

    const isRoutineCareOnly = hasOnlyRoutineCareSymptoms(symptoms);

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('id, patient_id, name, age')
      .eq('patient_id', patient_id)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ 
        error: 'Patient not found' 
      });
    }

    const visitData = {
      patient_id: patientData.id,
      visit_date: new Date().toISOString().split('T')[0],
      visit_time: new Date().toTimeString().split(' ')[0],
      appointment_type: appointment_type || 'Walk-in',
      symptoms: Array.isArray(symptoms) ? symptoms.join(', ') : symptoms,
      duration: isRoutineCareOnly ? null : duration,
      severity: isRoutineCareOnly ? null : severity,
      previous_treatment: previous_treatment || null,
      allergies: allergies || null,
      medications: medications || null
    };

    const { data: createdVisit, error: visitError } = await supabase
      .from('visit')
      .insert(visitData)
      .select()
      .single();

    if (visitError) {
      console.error('Visit creation error:', visitError);
      return res.status(500).json({ 
        error: 'Failed to create visit record',
        details: visitError.message 
      });
    }

    // Assign department based on symptoms
    const symptomsList = Array.isArray(symptoms) ? symptoms : symptoms.split(', ');
    const deptId = await assignDepartmentBySymptoms(symptomsList, patientData.age);

    const { data: deptData } = await supabase
      .from('department')
      .select('name')
      .eq('department_id', deptId)
      .single();

    const recommendedDepartment = deptData?.name || 'Internal Medicine';

    // Get next queue number for today in this department
    const today = new Date().toISOString().split('T')[0];
    const { data: existingQueues } = await supabase
      .from('queue')
      .select('queue_no, visit!inner(visit_date)')
      .eq('department_id', deptId)
      .eq('visit.visit_date', today);

    const maxQueueNo = existingQueues?.length > 0 
      ? Math.max(...existingQueues.map(q => q.queue_no)) 
      : 0;
    const queueNumber = maxQueueNo + 1;

    // Create queue entry
    const { data: queueData, error: queueError } = await supabase
      .from('queue')
      .insert({
        visit_id: createdVisit.visit_id,
        department_id: deptId,
        queue_no: queueNumber,
        status: 'waiting'
      })
      .select()
      .single();

    if (queueError) {
      console.error('Queue creation error:', queueError);
    }

    // Return complete response
    res.status(201).json({
      success: true,
      patient: patientData,
      visit: createdVisit,
      queue: queueData,
      recommendedDepartment: recommendedDepartment,
      queue_number: queueNumber,
      estimated_wait: '15-30 minutes',
      is_routine_care: isRoutineCareOnly,
      message: 'Appointment booked successfully'
    });

  } catch (error) {
    console.error('Visit booking error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get profiles
app.get('/api/healthcare/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: staffData, error } = await supabase
      .from('staff')
      .select('id, staff_id, name, role, specialization, department_id, license_no, contact_no')
      .eq('id', req.user.id)
      .single();

    if (error || !staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    res.json(staffData);
  } catch (error) {
    console.error('Get healthcare profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: adminData, error } = await supabase
      .from('admin')
      .select('id, healthadmin_id, name, position')
      .eq('id', req.user.id)
      .single();

    if (error || !adminData) {
      return res.status(404).json({
        error: 'Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      admin: adminData
    });

  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Temporary registration functions
const generateTempPatientId = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TEMP${timestamp}${random}`;
};

const generateHealthAssessmentId = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `HEALTH${timestamp}${random}`;
};

// Cleanup expired registrations
const cleanupExpiredRegistrations = async () => {
  try {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    console.log(`🧹 Starting cleanup at ${currentDate} ${currentTime}`);
    
    const { data: registrations, error: fetchError } = await supabase
      .from('pre_registration')
      .select(`
        temp_id, 
        temp_patient_id, 
        name, 
        preferred_date, 
        preferred_time_slot, 
        next_available_date,
        next_available_time,
        department_id, 
        status
      `)
      .in('status', ['pending', 'completed']);

    if (fetchError) {
      console.error('❌ Error fetching registrations:', fetchError);
      return;
    }

    if (!registrations || registrations.length === 0) {
      console.log('✅ No registrations to clean');
      return;
    }

    const expiredIds = [];
    
    for (const reg of registrations) {
      // ✅ SUBSPECIALTY SERVICE CHECK (with time slots)
      if (reg.department_id && reg.next_available_date && reg.next_available_time) {
        const { data: dept } = await supabase
          .from('department')
          .select('is_scheduled, service_type, name, available_days')
          .eq('department_id', reg.department_id)
          .single();

        if (dept && dept.is_scheduled && dept.service_type === 'subspecialty') {
          const nextDate = reg.next_available_date;
          const timeSlot = reg.next_available_time;
          
          // Parse end time from time slot (e.g., "08:00-17:00" -> "17:00")
          let endTime = '20:00'; // Default fallback
          if (timeSlot && timeSlot.includes('-')) {
            endTime = timeSlot.split('-')[1];
          }
          
          // Check if past the end time of the next available slot
          if (currentDate > nextDate || 
              (currentDate === nextDate && currentTime > endTime)) {
            console.log(`🗑️ Subspecialty expired: ${reg.name} - ${dept.name} (due: ${nextDate} ${endTime})`);
            expiredIds.push(reg.temp_id);
            continue;
          }
          
          // Still within waiting period
          console.log(`⏳ Waiting for ${reg.name} - ${dept.name} (due: ${nextDate} ${endTime})`);
          continue;
        }
      }

      // ✅ GENERAL SERVICE CHECK (existing logic)
      const appointmentDate = reg.preferred_date;
      const timeSlot = reg.preferred_time_slot;
      
      if (!appointmentDate) continue;
      
      // Past date
      if (appointmentDate < currentDate) {
        expiredIds.push(reg.temp_id);
        continue;
      }
      
      // Same date - check time slot
      if (appointmentDate === currentDate) {
        let hasExpired = false;
        
        switch (timeSlot) {
          case 'morning':
            hasExpired = currentTime >= '12:00';
            break;
          case 'afternoon':
            hasExpired = currentTime >= '17:00';
            break;
          case 'evening':
            hasExpired = currentTime >= '20:00';
            break;
          case 'anytime':
            hasExpired = currentTime >= '20:00';
            break;
          default:
            hasExpired = false;
        }
        
        if (hasExpired) {
          console.log(`🗑️ General service expired: ${reg.name} (slot: ${timeSlot})`);
          expiredIds.push(reg.temp_id);
        }
      }
    }

    if (expiredIds.length === 0) {
      console.log('✅ No expired registrations found');
      return;
    }

    // Delete expired registrations
    const { error: deleteError } = await supabase
      .from('pre_registration')
      .delete()
      .in('temp_id', expiredIds);

    if (deleteError) {
      console.error('❌ Error deleting expired registrations:', deleteError);
      return;
    }
    
    console.log(`✅ Cleaned up ${expiredIds.length} expired registrations`);
      
  } catch (error) {
    console.error('💥 Cleanup job error:', error);
  }
};

const cleanupUnusedQueueAndVisits = async () => {
  try {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    
    console.log('🧹 Starting cleanup of unused queue/visit records...');

    // Step 1: Find expired queue records
    const { data: expiredQueues, error: queueFetchError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        status,
        created_time,
        department_id,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          patient_id,
          outpatient!inner(
            id,
            patient_id,
            name
          )
        )
      `)
      .eq('status', 'waiting')
      .lt('visit.visit_date', currentDate);

    if (queueFetchError) {
      console.error('❌ Error fetching expired queues:', queueFetchError);
      return;
    }

    // Also check today's queues that are past their time slot
    const { data: todayExpiredQueues } = await supabase
      .from('queue')
      .select(`
        queue_id,
        status,
        created_time,
        department_id,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          patient_id,
          outpatient!inner(
            id,
            patient_id,
            name
          )
        )
      `)
      .eq('status', 'waiting')
      .eq('visit.visit_date', currentDate);

    // Filter today's queues by time (2 hours past their slot)
    const todayExpired = (todayExpiredQueues || []).filter(queue => {
      const visitTime = queue.visit.visit_time;
      const [hours, minutes] = visitTime.split(':').map(Number);
      
      const visitDateTime = new Date();
      visitDateTime.setHours(hours, minutes, 0, 0);
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
      
      return visitDateTime < twoHoursAgo;
    });

    const allExpiredQueues = [...(expiredQueues || []), ...todayExpired];

    if (allExpiredQueues.length === 0) {
      console.log('✅ No expired queue records to clean');
      return;
    }

    console.log(`📊 Found ${allExpiredQueues.length} expired queue records`);

    // ✅ NEW: Filter based on department schedule
    const toDelete = [];
    
    for (const queue of allExpiredQueues) {
      // Check if department is scheduled
      const { data: dept } = await supabase
        .from('department')
        .select('is_scheduled, available_days, service_type')
        .eq('department_id', queue.department_id)
        .single();

      if (dept && dept.is_scheduled && dept.service_type === 'subspecialty') {
        // Calculate if patient missed their next available date
        const nextAvailable = await calculateNextAvailableDate(queue.department_id);
        if (currentDate > nextAvailable.date) {
          toDelete.push(queue);
        }
      } else {
        // General service - use existing logic (past date = expired)
        toDelete.push(queue);
      }
    }

    console.log(`📊 After schedule filtering: ${toDelete.length} records to delete`);

    // Step 2: Process each expired queue
    for (const queue of toDelete) {
      const patientDbId = queue.visit.patient_id;
      const visitId = queue.visit.visit_id;
      const queueId = queue.queue_id;
      const patientName = queue.visit.outpatient.name;

      // Check if this patient has ANY completed visits (visits with diagnosis)
      const { data: completedVisits, error: completedError } = await supabase
        .from('diagnosis')
        .select('visit_id, visit!inner(patient_id)')
        .eq('visit.patient_id', patientDbId);

      if (completedError) {
        console.error(`❌ Error checking completed visits for patient ${patientDbId}:`, completedError);
        continue;
      }

      // Check if current visit has diagnosis
      const currentVisitHasDiagnosis = completedVisits?.some(d => d.visit_id === visitId);

      if (currentVisitHasDiagnosis) {
        // This visit was completed, don't delete anything
        console.log(`✅ Visit ${visitId} was completed - keeping record`);
        continue;
      }

      // Check if patient has OTHER completed visits (excluding current one)
      const hasOtherCompletedVisits = completedVisits?.some(d => d.visit_id !== visitId);

      if (hasOtherCompletedVisits) {
        // RETURNING PATIENT: Has past successful visits
        // Delete only the unused queue and visit
        console.log(`🔄 Returning patient "${patientName}" - deleting unused visit/queue only`);

        // Delete queue
        await supabase
          .from('queue')
          .delete()
          .eq('queue_id', queueId);

        // Delete visit
        await supabase
          .from('visit')
          .delete()
          .eq('visit_id', visitId);

        console.log(`✅ Deleted unused visit/queue for returning patient "${patientName}"`);

      } else {
        // NEW PATIENT: No past successful visits
        // Delete EVERYTHING including personal info
        console.log(`🆕 New patient "${patientName}" never showed up - deleting all records`);

        // Delete in order due to foreign key constraints
        
        // 1. Delete queue
        await supabase
          .from('queue')
          .delete()
          .eq('queue_id', queueId);

        // 2. Delete visit
        await supabase
          .from('visit')
          .delete()
          .eq('visit_id', visitId);

        // 3. Delete any OTP records
        await supabase
          .from('otp_verification')
          .delete()
          .eq('patient_id', queue.visit.outpatient.patient_id);

        // 4. Delete emergency contact
        await supabase
          .from('emergency_contact')
          .delete()
          .eq('patient_id', patientDbId);

        // 5. Delete health questionnaire if exists
        await supabase
          .from('health_questionnaire')
          .delete()
          .eq('patient_id', patientDbId);

        // 6. Finally delete patient record
        const { error: deletePatientError } = await supabase
          .from('outpatient')
          .delete()
          .eq('id', patientDbId);

        if (deletePatientError) {
          console.error(`❌ Error deleting patient record:`, deletePatientError);
        } else {
          console.log(`✅ Completely removed new patient "${patientName}" (ID: ${queue.visit.outpatient.patient_id})`);
        }
      }
    }

    console.log(`✅ Cleanup completed successfully`);
    
  } catch (error) {
    console.error('💥 Cleanup job error:', error);
  }
};

const cleanupExpiredHealthAssessments = async () => {
  try {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    const { data: assessments, error: fetchError } = await supabase
      .from('health_questionnaire')
      .select('assessment_id, temp_assessment_id, preferred_date, preferred_time_slot, expires_at')
      .in('status', ['pending']);

    if (fetchError) {
      console.error('Error fetching health assessments for cleanup:', fetchError);
      return;
    }

    if (!assessments || assessments.length === 0) {
      return;
    }

    const expiredIds = [];
    
    assessments.forEach(assessment => {
      const appointmentDate = assessment.preferred_date;
      const timeSlot = assessment.preferred_time_slot;
      
      if (!appointmentDate) return;
      
      if (appointmentDate < currentDate) {
        expiredIds.push(assessment.assessment_id);
        return;
      }
      
      if (appointmentDate === currentDate) {
        let hasExpired = false;
        
        switch (timeSlot) {
          case 'morning':
            hasExpired = currentHour >= 12;
            break;
          case 'afternoon':
            hasExpired = currentHour >= 17;
            break;
          case 'evening':
            hasExpired = currentHour >= 20;
            break;
          case 'anytime':
            hasExpired = currentHour >= 20;
            break;
          default:
            hasExpired = false;
        }
        
        if (hasExpired) {
          expiredIds.push(assessment.assessment_id);
        }
      }
    });

    if (expiredIds.length === 0) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('health_questionnaire')
      .delete()
      .in('assessment_id', expiredIds);

    if (deleteError) {
      console.error('Error deleting expired health assessments:', deleteError);
      return;
    }
      
  } catch (error) {
console.error('Health assessment cleanup job error:', error);
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupExpiredRegistrations, 30 * 60 * 1000);
setInterval(cleanupExpiredHealthAssessments, 30 * 60 * 1000);
setInterval(cleanupUnusedQueueAndVisits, 30 * 60 * 1000);

// Run cleanup on server start
cleanupExpiredRegistrations();
cleanupExpiredHealthAssessments();
cleanupUnusedQueueAndVisits();

// Manual cleanup endpoint
app.post('/api/admin/cleanup-expired', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await cleanupExpiredRegistrations();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully'
    });
    
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// Appointment date validation
const validateAppointmentDate = (preferredDate) => {
  if (!preferredDate) return null;
  
  const appointmentDate = new Date(preferredDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  oneYearFromNow.setHours(0, 0, 0, 0);
  
  if (appointmentDate < today) {
    return 'Appointment date cannot be in the past';
  }
  
  if (appointmentDate > oneYearFromNow) {
    return 'Appointment date cannot be more than 1 year from now';
  }
  
  return null;
};

// Temporary registration
app.post('/api/temp-registration', async (req, res) => {
  try {
    console.log('📝 Temp registration request:', req.body);
          
    const {
      name, birthday, age, sex, address, contact_no, email,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_no,
      symptoms, duration, severity, previous_treatment, allergies, medications,
      preferred_date, preferred_time_slot, scheduled_date, status, expires_at
    } = req.body;

    // Check for duplicates BEFORE processing
    const duplicateCheck = await checkDuplicateUser(email, contact_no);
    if (duplicateCheck.isDuplicate) {
      return res.status(400).json({
        error: duplicateCheck.message,
        field: duplicateCheck.field
      });
    }

    if (preferred_date) {
      const dateValidationError = validateAppointmentDate(preferred_date);
      if (dateValidationError) {
        return res.status(400).json({
          error: dateValidationError
        });
      }
    }

    // Generate temp patient ID
    const temp_patient_id = generateTempPatientId();

    // Insert into tempReg table
    const { data: tempRegData, error: tempRegError } = await supabase
      .from('pre_registration')
      .insert({
        name,
        birthday,
        age: parseInt(age),
        sex,
        address,
        contact_no: contact_no.replace(/\D/g, ''), // Clean phone number
        email: email.toLowerCase(),
        emergency_contact_name,
        emergency_contact_relationship,
        emergency_contact_no: emergency_contact_no ? emergency_contact_no.replace(/\D/g, '') : null,
        symptoms,
        duration,
        severity,
        previous_treatment,
        allergies,
        medications,
        preferred_date,
        preferred_time_slot,
        scheduled_date,
        status: status || 'completed',
        expires_at,
        temp_patient_id,
        created_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (tempRegError) {
      console.error('💥 Temp registration error:', tempRegError);
      
      return res.status(500).json({
        error: 'Registration failed. Please try again.',
        details: tempRegError.message
      });
    }

    console.log('✅ Temp registration created:', tempRegData.name, 'ID:', tempRegData.temp_patient_id);

    res.status(201).json({
      success: true,
      message: 'Temporary registration created successfully',
      temp_id: tempRegData.temp_id,
      temp_patient_id: tempRegData.temp_patient_id
    });

  } catch (error) {
    console.error('💥 Temp registration error:', error);
    res.status(500).json({
      error: 'Registration failed. Please try again.',
      details: error.message
    });
  }
});

// Health assessment creation
app.post('/api/health-assessment', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      symptoms,
      duration,
      severity,
      previous_treatment,
      allergies,
      medications,
      preferred_date,
      preferred_time_slot
    } = req.body;

    if (!symptoms || !preferred_date || !preferred_time_slot) {
      return res.status(400).json({
        error: 'Symptoms, preferred date and time slot are required'
      });
    }

    const isRoutineCareOnly = hasOnlyRoutineCareSymptoms(symptoms);
    
    if (!isRoutineCareOnly && (!duration || !severity)) {
      return res.status(400).json({
        error: 'Duration and severity are required for non-routine care symptoms'
      });
    }

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select('id, patient_id, name, email')
      .eq('patient_id', req.user.patientId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    const temp_assessment_id = generateHealthAssessmentId();
    
    const appointmentDate = new Date(preferred_date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const expires_at = appointmentDate > tomorrow ? tomorrow : new Date(appointmentDate.getTime() + 24 * 60 * 60 * 1000);

    const assessmentData = {
      patient_id: patientData.id,
      temp_assessment_id,
      symptoms: Array.isArray(symptoms) ? symptoms.join(', ') : symptoms,
      duration: isRoutineCareOnly ? null : duration,
      severity: isRoutineCareOnly ? null : severity,
      previous_treatment,
      allergies,
      medications,
      preferred_date,
      preferred_time_slot,
      status: 'pending',
      expires_at: expires_at.toISOString()
    };

    const { data: createdAssessment, error: assessmentError } = await supabase
      .from('health_questionnaire')
      .insert(assessmentData)
      .select()
      .single();

    if (assessmentError) {
      console.error('Health assessment creation error:', assessmentError);
      return res.status(500).json({
        error: 'Failed to create health assessment',
        details: assessmentError.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Health assessment created successfully',
      assessment_id: createdAssessment.assessment_id,
      temp_assessment_id: createdAssessment.temp_assessment_id,
      is_routine_care: isRoutineCareOnly
    });

  } catch (error) {
    console.error('Health assessment creation error:', error);
    res.status(500).json({
      error: 'Failed to create health assessment',
      details: error.message
    });
  }
});

// Update temp registration with health assessment
app.put('/api/temp-registration/:id/health-assessment', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      symptoms,
      duration,
      severity,
      previous_treatment,
      allergies,
      medications,
      preferred_date,
      preferred_time_slot,
      scheduled_date,
      status
    } = req.body;

    const { data: updatedData, error: updateError } = await supabase
      .from('pre_registration')
      .update({
        symptoms,
        duration,
        severity,
        previous_treatment,
        allergies,
        medications,
        preferred_date,
        preferred_time_slot,
        scheduled_date,
        status: status || 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('temp_id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Health assessment update error:', updateError);
      return res.status(500).json({
        error: 'Failed to update health assessment. Please try again.',
        details: updateError.message
      });
    }

    if (!updatedData) {
      return res.status(404).json({
        error: 'Registration not found'
      });
    }

    res.json({
      success: true,
      message: 'Health assessment updated successfully',
      data: updatedData
    });

  } catch (error) {
    console.error('Health assessment update error:', error);
    res.status(500).json({
      error: 'Failed to update health assessment. Please try again.',
      details: error.message
    });
  }
});

// Get health assessment
app.get('/api/health-assessment/:tempAssessmentId', async (req, res) => {
  try {
    const { tempAssessmentId } = req.params;
    
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('health_questionnaire')
      .select(`
        *,
        outpatient!inner(
          patient_id,
          name,
          email,
          contact_no,
          age
        )
      `)
      .eq('temp_assessment_id', tempAssessmentId)
      .eq('status', 'pending')
      .single();

    if (assessmentError || !assessmentData) {
      return res.status(404).json({
        success: false,
        error: 'Health assessment not found or expired'
      });
    }

    const now = new Date();
    const expiresAt = new Date(assessmentData.expires_at);
    
    if (now > expiresAt) {
      await supabase
        .from('health_questionnaire')
        .delete()
        .eq('assessment_id', assessmentData.assessment_id);
      
      return res.status(404).json({
        success: false,
        error: 'Health assessment has expired'
      });
    }

    res.json({
      success: true,
      assessment: {
        temp_assessment_id: assessmentData.temp_assessment_id,
        symptoms: assessmentData.symptoms,
        duration: assessmentData.duration,
        severity: assessmentData.severity,
        previous_treatment: assessmentData.previous_treatment,
        allergies: assessmentData.allergies,
        medications: assessmentData.medications,
        preferred_date: assessmentData.preferred_date,
        preferred_time_slot: assessmentData.preferred_time_slot,
        expires_at: assessmentData.expires_at,
        patient: {
          patient_id: assessmentData.outPatient.patient_id,
          name: assessmentData.outPatient.name,
          email: assessmentData.outPatient.email,
          contact_no: assessmentData.outPatient.contact_no,
          age: assessmentData.outPatient.age
        }
      }
    });

  } catch (error) {
    console.error('Get health assessment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Generate health assessment QR
app.post('/api/generate-health-assessment-qr', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { temp_assessment_id } = req.body;

    if (!temp_assessment_id) {
      return res.status(400).json({
        error: 'Assessment ID is required'
      });
    }

    const { data: assessmentData, error: assessmentError } = await supabase
      .from('health_questionnaire')
      .select(`
        *,
        outpatient!inner(
          patient_id,
          name,
          email,
          age,
          sex,
          contact_no,
          address,
          birthday,
          registration_date
        )
      `)
      .eq('temp_assessment_id', temp_assessment_id)
      .eq('status', 'pending')
      .single();

    if (assessmentError || !assessmentData) {
      return res.status(404).json({
        error: 'Health assessment not found or expired'
      });
    }

    const { data: tokenPatientData } = await supabase
      .from('outpatient')
      .select('id, patient_id')
      .eq('patient_id', req.user.patientId)
      .single();

    if (!tokenPatientData || assessmentData.patient_id !== tokenPatientData.id) {
      return res.status(403).json({
        error: 'This health assessment does not belong to your account'
      });
    }

    const symptomsList = assessmentData.symptoms ? assessmentData.symptoms.split(', ') : [];
    const deptId = await assignDepartmentBySymptoms(symptomsList, assessmentData.outPatient.age);

    const { data: deptData } = await supabase
      .from('department')
      .select('name')
      .eq('department_id', deptId)
      .single();

    const recommendedDepartment = deptData?.name || 'Internal Medicine';

    const qrData = {
      type: 'health_assessment',
      tempAssessmentId: temp_assessment_id,
      patientId: assessmentData.outPatient.patient_id,
      patientName: assessmentData.outPatient.name,
      department: recommendedDepartment,
      scheduledDate: assessmentData.preferred_date,
      preferredTime: assessmentData.preferred_time_slot,
      symptoms: assessmentData.symptoms,
      severity: assessmentData.severity,
      duration: assessmentData.duration,
      previousTreatment: assessmentData.previous_treatment,
      allergies: assessmentData.allergies,
      medications: assessmentData.medications,
      timestamp: new Date().toISOString(),
      expiresAt: assessmentData.expires_at,
      patientEmail: assessmentData.outPatient.email,
      patientPhone: assessmentData.outPatient.contact_no
    };

    let qrCodeDataURL;
    try {
      const qrString = JSON.stringify(qrData);
      qrCodeDataURL = await QRCode.toDataURL(qrString, {
        width: 256,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (qrError) {
      console.error('QR generation failed:', qrError.message);
      return res.status(500).json({
        error: 'QR code generation failed',
        details: qrError.message
      });
    }

    try {
      const transporter = nodemailer.createTransport(emailConfig);
      await transporter.verify();

      const patientName = assessmentData.outPatient.name;
      const patientEmail = assessmentData.outPatient.email;
      
      const appointmentDate = assessmentData.preferred_date ? 
        new Date(assessmentData.preferred_date).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }) : 'Not specified';

      const appointmentTime = assessmentData.preferred_time_slot || 'Not specified';

      let qrCodeBuffer;
      try {
        const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
        qrCodeBuffer = Buffer.from(base64Data, 'base64');
      } catch (bufferError) {
        console.error('Health assessment buffer conversion failed:', bufferError.message);
        return res.status(500).json({
          error: 'Image processing failed',
          details: bufferError.message
        });
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: patientEmail,
        subject: 'CliCare - Your Health Assessment QR Code',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
          </head>

          <body style="margin:0; padding:0; background:#ffffff; font-family:'Poppins', sans-serif;">
            <div style="max-width:600px; margin:0 auto; padding:24px 24px;">

              <!-- LOGO -->
              <div style="text-align:center; margin-bottom:24px;">
                <img src="cid:clicareLogo" alt="CliCare Hospital" style="height:28px; width:auto;">
              </div>

              <!-- TITLE -->
              <p style="color:#27371f; font-size:16px; font-weight:600; text-align:center; margin:0 0 4px 0;">
                Health Assessment Submitted
              </p>
              <p style="color:#6b7280; font-size:14px; font-weight:300; text-align:center; margin:0 0 32px 0;">
                Your QR code is ready.
              </p>

              <!-- GREETING -->
              <p style="color:#27371f; font-size:15px; font-weight:500; margin:0 0 6px 0;">
                Hello ${patientName},
              </p>
              <p style="color:#6b7280; font-size:14px; font-weight:300; line-height:1.6; margin:0 0 24px 0;">
                Your health assessment has been successfully submitted. Please present the QR code below when you arrive at the hospital for faster check-in.
              </p>

              <!-- QR CODE BLOCK -->
              <div style="text-align:center; margin:0 0 24px 0;">
                <div style="display:inline-block; background:#f9fafb; border-radius:12px; padding:20px 24px; border:1px solid #e5e7eb;">
                  <img src="cid:healthqrcode" alt="Health Assessment QR Code" style="max-width:200px; height:auto; border-radius:6px;">
                  <p style="color:#6b7280; font-size:13px; font-weight:400; margin:12px 0 0 0;">
                    Present this QR code at the kiosk or reception desk
                  </p>
                </div>
              </div>

              <!-- DIVIDER -->
              <div style="height:1px; background:#e5e7eb; margin:0 0 32px 0;"></div>

              <!-- DETAILS HEADER -->
              <p style="color:#27371f; font-size:14px; font-weight:500; margin:0 0 12px 0;">
                Assessment Details:
              </p>

              <!-- DETAILS BOX -->
              <div style="background:#f9fafb; padding:16px; border-radius:8px; margin:0 0 32px 0;">
                <p style="color:#6b7280; margin:0; font-size:14px; line-height:1.8;">
                  <strong style="color:#27371f;">Assessment ID:</strong> ${temp_assessment_id}<br>
                  <strong style="color:#27371f;">Patient ID:</strong> ${assessmentData.outPatient.patient_id}<br>
                  <strong style="color:#27371f;">Recommended Department:</strong> ${recommendedDepartment}<br>
                  <strong style="color:#27371f;">Preferred Date:</strong> ${appointmentDate}<br>
                  <strong style="color:#27371f;">Preferred Time:</strong> ${appointmentTime}<br>
                  <strong style="color:#27371f;">Symptoms:</strong> ${assessmentData.symptoms || 'Not specified'}<br>
                  <strong style="color:#27371f;">Severity:</strong> ${assessmentData.severity || 'Not specified'}
                </p>
              </div>

              <!-- NEXT STEPS HEADER -->
              <p style="color:#27371f; font-size:14px; font-weight:500; margin:0 0 12px 0;">
                What to do next:
              </p>

              <!-- NEXT STEPS BOX -->
              <div style="background:#f9fafb; padding:16px; border-radius:8px; margin:0 0 32px 0;">
                <ol style="color:#6b7280; font-size:14px; padding-left:18px; margin:0; line-height:1.7;">
                  <li>Present this QR code when you arrive</li>
                  <li>Scan it at the kiosk or show it to reception staff</li>
                  <li>Valid until <strong>${new Date(assessmentData.expires_at).toLocaleDateString()}</strong></li>
                  <li>Bring a valid ID for verification</li>
                </ol>
              </div>

              <!-- IMPORTANT -->
              <p style="color:#dc2626; font-size:13px; font-weight:500; margin:0 0 6px 0;">
                Important
              </p>

              <p style="color:#9ca3af; font-size:12px; line-height:1.6; margin:0 0 32px 0;">
                This QR code is personalized for <strong style="color:#27371f;">${patientName}</strong> (Patient ID: ${assessmentData.outPatient.patient_id}).  
                It cannot be used by other patients and will expire on  
                <strong style="color:#27371f;">${new Date(assessmentData.expires_at).toLocaleDateString()}</strong>.
              </p>

              <!-- FOOTER -->
              <div style="text-align:center; padding-top:20px; border-top:1px solid #e5e7eb;">
                <p style="color:#d1d5db; font-size:11px; font-weight:300; margin:0;">
                  CliCare Hospital Management System<br>
                  This is an automated message. Please do not reply.
                </p>
              </div>

            </div>
          </body>
          </html>
        `,
        attachments: [
          {
            filename: 'clicareLogo.png',
            path: path.join(__dirname, '../src/clicareLogo.png'),
            cid: 'clicareLogo'
          },
          {
            filename: 'health-assessment-qr.png',
            content: qrCodeBuffer,
            cid: 'healthqrcode'
          }
        ]
      };

      const emailResult = await transporter.sendMail(mailOptions);

    } catch (emailError) {
      console.error('Health assessment email sending failed:', emailError.message);
      
      return res.json({
        success: true,
        message: 'Health assessment QR code generated successfully, but email delivery failed',
        temp_assessment_id: temp_assessment_id,
        recommended_department: recommendedDepartment,
        qrCodeDataURL: qrCodeDataURL,
        qr_type: 'health_assessment',
        emailError: 'Email delivery failed - please save the QR code from this response'
      });
    }

    res.json({
      success: true,
      message: 'Health assessment QR code generated and sent successfully',
      temp_assessment_id: temp_assessment_id,
      recommended_department: recommendedDepartment,
      qrCodeDataURL: qrCodeDataURL,
      qr_type: 'health_assessment'
    });

  } catch (error) {
    console.error('Health assessment QR generation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Debug token endpoint
app.get('/api/debug/token', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    message: 'Token is valid'
  });
});

// Generate QR email
app.post('/api/generate-qr-email', async (req, res) => {
  try {
    console.log('📧 QR generation request received');
    
    const { qrData, patientEmail, patientName } = req.body;

    // Validate input
    if (!qrData || !patientEmail || !patientName) {
      console.error('Missing required data:', { qrData: !!qrData, patientEmail: !!patientEmail, patientName: !!patientName });
      return res.status(400).json({
        error: 'Missing required data for QR generation'
      });
    }

    // Step 1: Generate QR code
    console.log('Step 1: Generating QR code...');
    let qrCodeDataURL;
    try {
      const qrString = JSON.stringify(qrData);
      console.log('QR data string length:', qrString.length);
      
      qrCodeDataURL = await QRCode.toDataURL(qrString, {
        width: 256,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      console.log('✅ QR code generated successfully');
    } catch (qrError) {
      console.error('❌ QR generation failed:', qrError.message);
      return res.status(500).json({
        error: 'QR code generation failed',
        details: qrError.message
      });
    }

    // Step 2: Convert to buffer
    console.log('Step 2: Converting to buffer...');
    let qrCodeBuffer;
    try {
      const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
      qrCodeBuffer = Buffer.from(base64Data, 'base64');
      console.log('✅ Buffer created, size:', qrCodeBuffer.length, 'bytes');
    } catch (bufferError) {
      console.error('❌ Buffer conversion failed:', bufferError.message);
      return res.status(500).json({
        error: 'Image processing failed',
        details: bufferError.message
      });
    }

    // Step 3: Prepare email
    console.log('Step 3: Preparing email...');
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      </head>

      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Poppins', sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px 24px;">

          <!-- Logo -->
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="cid:clicareLogo" alt="CliCare Hospital" style="height: 28px; width: auto;">
          </div>

          <!-- Greeting -->
          <p style="color: #27371f; font-size: 15px; font-weight: 500; margin: 0 0 6px 0;">
            Hello ${patientName},
          </p>

          <p style="color: #6b7280; font-size: 14px; font-weight: 300; line-height: 1.5; margin: 0 0 24px 0;">
            Your registration has been successfully recorded. Please present the QR code below upon arriving at the hospital.
          </p>

          <!-- QR CODE BLOCK -->
          <div style="text-align: center; margin: 0 0 24px 0;">
            <div style="display: inline-block; background: #f9fafb; border-radius: 8px; padding: 16px 20px;">
              <img src="cid:qrcode" alt="QR Code" style="max-width: 200px; height: auto; border-radius: 6px;">
              <p style="color: #6b7280; font-size: 13px; font-weight: 400; margin: 12px 0 0 0;">
                Show this QR code to the registration staff
              </p>
            </div>
          </div>

          <!-- Appointment Details Title -->
          <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
            Appointment Details:
          </p>

          <!-- APPOINTMENT DETAILS LIST -->
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.8;">
              <strong style="color: #27371f;">Department:</strong> ${qrData.department || 'General Practice'}<br>
              <strong style="color: #27371f;">Date:</strong> ${qrData.scheduledDate || 'To be confirmed'}<br>
              <strong style="color: #27371f;">Time:</strong> ${qrData.preferredTime || 'To be confirmed'}<br>
              <strong style="color: #27371f;">Temporary Patient ID:</strong> ${qrData.tempPatientId || 'N/A'}
            </p>
          </div>

          <!-- NEXT STEPS -->
          <p style="color: #27371f; font-size: 14px; font-weight: 500; margin: 0 0 12px 0;">
            What to do next:
          </p>

          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 0 0 24px 0;">
            <ol style="color: #6b7280; font-size: 14px; padding-left: 18px; margin: 0; line-height: 1.7;">
              <li>Arrive 15 minutes before your scheduled time</li>
              <li>Go directly to the registration desk</li>
              <li>Present the QR code</li>
              <li>Wait for your queue number to be called</li>
            </ol>
          </div>

          <!-- FOOTER -->
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #d1d5db; font-size: 11px; font-weight: 300; line-height: 1.5; margin: 0;">
              CliCare Hospital Management System<br>
              This is an automated message. Please do not reply.
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    // Step 4: Send email
    console.log('Step 4: Sending email to:', patientEmail);
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
      
      // Verify connection
      await transporter.verify();
      console.log('✅ Email transport verified');
      
      const mailOptions = {
        from: `"CliCare Hospital" <${process.env.EMAIL_USER}>`,
        to: patientEmail,
        subject: `Your CliCare Registration QR Code - ${patientName}`,
        html: emailHtml,
        attachments: [
          {
            filename: 'clicareLogo.png',
            path: path.join(__dirname, '../src/clicareLogo.png'),
            cid: 'clicareLogo'
          },
          {
            filename: 'qr-code.png',
            content: qrCodeBuffer,
            cid: 'qrcode'
          }
        ]
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully. Message ID:', result.messageId);

    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      return res.status(500).json({
        error: 'Failed to send email',
        details: emailError.message
      });
    }

    // Step 5: Update database (optional)
    try {
      await supabase
        .from('pre_registration')
        .update({ 
          qr_code: JSON.stringify(qrData),
          updated_at: new Date().toISOString()
        })
        .eq('temp_patient_id', qrData.tempPatientId);
      console.log('✅ Database updated');
    } catch (dbError) {
      console.warn('⚠️ Database update failed (non-critical):', dbError.message);
    }

    console.log('🎉 QR generation and email process completed successfully');

    res.json({
      success: true,
      message: 'QR code generated and sent successfully to ' + patientEmail,
      qrCodeDataURL: qrCodeDataURL
    });

  } catch (error) {
    console.error('💥 Unexpected error in QR generation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get temp registration
app.get('/api/temp-registration/:tempPatientId', async (req, res) => {
  try {
    const { tempPatientId } = req.params;
    
    const { data: regData, error: regError } = await supabase
      .from('pre_registration')
      .select('*')
      .eq('temp_patient_id', tempPatientId)
      .in('status', ['completed', 'pending'])
      .single();
    
    if (regError || !regData) {
      return res.status(404).json({
        success: false,
        error: 'Registration not found or expired'
      });
    }

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    if (regData.expires_at) {
      const expiresAt = new Date(regData.expires_at);
      if (now > expiresAt) {
        await supabase.from('pre_registration').delete().eq('temp_id', regData.temp_id);
        return res.status(404).json({
          success: false,
          error: 'Registration has expired'
        });
      }
    }

    if (regData.preferred_date) {
      const appointmentDate = regData.preferred_date;
      const timeSlot = regData.preferred_time_slot;
      
      let hasExpired = false;
      
      if (appointmentDate < currentDate) {
        hasExpired = true;
      }
      else if (appointmentDate === currentDate && timeSlot) {
        switch (timeSlot) {
          case 'morning':
            hasExpired = currentHour >= 12;
            break;
          case 'afternoon':
            hasExpired = currentHour >= 17;
            break;
          case 'evening':
            hasExpired = currentHour >= 20;
            break;
          case 'anytime':
            hasExpired = currentHour >= 20;
            break;
        }
      }
      
      if (hasExpired) {
        await supabase.from('pre_registration').delete().eq('temp_id', regData.temp_id);
        return res.status(404).json({
          success: false,
          error: 'Registration appointment time has passed'
        });
      }
    }
    
    res.json({
      success: true,
      data: regData,
      qr_type: 'registration'
    });
    
  } catch (error) {
    console.error('Get registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve registration details',
      details: error.message
    });
  }
});

// Delete temp registration
app.delete('/api/temp-registration/:tempId', async (req, res) => {
  try {
    const { tempId } = req.params;
    
    const { error: deleteError } = await supabase
      .from('pre_registration')
      .delete()
      .eq('temp_id', tempId);

    if (deleteError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete temporary registration',
        details: deleteError.message
      });
    }

    res.json({
      success: true,
      message: 'Temporary registration deleted successfully'
    });

  } catch (error) {
    console.error('Delete temp registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'CliCare Admin Backend is running',
    timestamp: new Date().toISOString(),
    env: {
      emailConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      emailHost: process.env.SMTP_HOST,
      emailPort: process.env.SMTP_PORT,
      smsConfigured: isSMSConfigured,
      supabaseConfigured: !!SUPABASE_URL,
      smsProvider: 'TextBee'
    }
  });
});

// Patient endpoints
app.get('/api/patient/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: patientData, error: patientError } = await supabase
      .from('outpatient')
      .select(`
        *,
        emergency_contact(
          name,
          contact_number,
          relationship
        )
      `)
      .eq('patient_id', req.user.patientId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.status(200).json({
      success: true,
      patient: patientData
    });

  } catch (error) {
    console.error('Patient profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/patient/history/:patientId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patientId } = req.params;
    
    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id')
      .eq('patient_id', patientId)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: visitHistory, error: visitError } = await supabase
      .from('visit')
      .select(`
        visit_id,
        visit_date,
        visit_time,
        appointment_type,
        symptoms,
        diagnosis(
          diagnosis_description,
          severity
        ),
        queue(
          queue_no,
          status,
          department(name)
        )
      `)
      .eq('patient_id', patientData.id)
      .order('visit_date', { ascending: false });

    res.status(200).json({
      success: true,
      visitHistory: visitHistory || []
    });

  } catch (error) {
    console.error('Patient history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lab-related endpoints
app.get('/api/healthcare/lab-requests', authenticateToken, async (req, res) => {
    try {
      if (req.user.type !== 'healthcare') {
        return res.status(403).json({ error: 'Access denied' });
      }

      // FIXED: Get ALL lab requests regardless of status
      const { data: labRequests, error: labRequestsError } = await supabase
        .from('lab_request')
        .select(`
          *,
          visit!inner(
            visit_id,
            visit_date,
            outpatient!inner(
              id,
              patient_id,
              name,
              age,
              sex,
              contact_no
            )
          )
        `)
        .eq('staff_id', req.user.id)
        .order('request_id', { ascending: false });

      if (labRequestsError) {
        console.error('Lab requests fetch error:', labRequestsError);
        return res.status(500).json({ error: 'Failed to fetch lab requests' });
      }

      const requestIds = (labRequests || []).map(req => req.request_id);
      let allResults = [];
      
      if (requestIds.length > 0) {
        const { data: resultsData } = await supabase
          .from('lab_result')
          .select('*')
          .in('request_id', requestIds)
          .order('upload_date', { ascending: true });
        
        allResults = resultsData || [];
      }

      const resultsByRequest = allResults.reduce((acc, result) => {
        if (!acc[result.request_id]) {
          acc[result.request_id] = [];
        }
        acc[result.request_id].push(result);
        return acc;
      }, {});

      const formattedRequests = (labRequests || []).map(request => {
        const results = resultsByRequest[request.request_id] || [];
        let resultData = null;
        let hasMultipleTests = false;

        const testTypes = request.test_type.split(', ').map(t => t.trim());
        hasMultipleTests = testTypes.length > 1;

        if (results.length > 0) {
          if (hasMultipleTests && results.length > 1) {
            resultData = {
              isMultiple: true,
              files: results.map((result, index) => {
                let testName = 'Unknown Test';
                let originalFileName = 'uploaded_file';
                
                try {
                  const parsedResults = JSON.parse(result.results);
                  testName = parsedResults.testName || testTypes[index] || `Test ${index + 1}`;
                  originalFileName = parsedResults.originalName || result.file_path?.split('/').pop() || 'uploaded_file';
                } catch (e) {
                  testName = testTypes[index] || `Test ${index + 1}`;
                  originalFileName = result.file_path?.split('/').pop() || 'uploaded_file';
                }

                return {
                  result_id: result.result_id,
                  file_name: originalFileName,
                  file_url: result.file_path,
                  upload_date: result.upload_date,
                  testName: testName,
                  testType: testTypes[index] || 'Unknown Type'
                };
              }),
              upload_date: results[0].upload_date,
              totalFiles: results.length
            };
          } else {
            const result = results[0];
            let testName = request.test_type;
            let originalFileName = 'uploaded_file';
            
            try {
              const parsedResults = JSON.parse(result.results);
              testName = parsedResults.testName || request.test_type;
              originalFileName = parsedResults.originalName || result.file_path?.split('/').pop() || 'uploaded_file';
            } catch (e) {
              originalFileName = result.file_path?.split('/').pop() || 'uploaded_file';
            }

            resultData = {
              isMultiple: false,
              result_id: result.result_id,
              file_name: originalFileName,
              file_url: result.file_path,
              upload_date: result.upload_date,
              testName: testName,
              results: result.results
            };
          }
        }

        return {
          request_id: request.request_id,
          test_name: request.test_type,
          test_type: request.test_type,
          priority: 'normal',
          status: request.status,
          instructions: '',
          due_date: request.due_date,
          created_at: request.visit?.visit_date || new Date().toISOString(),
          hasMultipleTests: hasMultipleTests,
          expectedFileCount: testTypes.length,
          uploadedFileCount: results.length,
          patient: {
            patient_id: request.visit?.outpatient?.patient_id || 'Unknown',
            name: request.visit?.outpatient?.name || 'Unknown',
            age: request.visit?.outpatient?.age || 0,
            sex: request.visit?.outpatient?.sex || 'Unknown',
            contact_no: request.visit?.outpatient?.contact_no || 'Unknown'
          },
          labResult: resultData
        };
      });

      res.status(200).json({
        success: true,
        labRequests: formattedRequests
      });

    } catch (error) {
      console.error('Get lab requests error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

app.get('/api/healthcare/lab-results', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ✅ FIX: Correct query with proper table names
    const { data: labResults, error: labResultsError } = await supabase
      .from('lab_result')
      .select(`
        *,
        lab_request!inner(
          request_id,
          test_type,
          staff_id,
          visit!inner(
            visit_id,
            visit_date,
            outpatient!inner(
              patient_id,
              name,
              age,
              sex,
              contact_no
            )
          )
        )
      `)
      .eq('lab_request.staff_id', req.user.id)
      .order('upload_date', { ascending: false });

    if (labResultsError) {
      console.error('Lab results fetch error:', labResultsError);
      return res.status(500).json({ error: 'Failed to fetch lab results' });
    }

    // ✅ FIX: Add null checks
    const formattedResults = (labResults || []).map(result => ({
      result_id: result.result_id,
      request_id: result.request_id,
      file_name: result.file_path ? result.file_path.split('/').pop() : 'Unknown File',
      file_url: result.file_path,
      upload_date: result.upload_date,
      results: result.results,
      interpretation: result.interpretation,
      test_type: result.lab_request?.test_type || 'Unknown',  // ✅ Added optional chaining
      patient: {
        patient_id: result.lab_request?.visit?.outpatient?.patient_id || 'Unknown',
        name: result.lab_request?.visit?.outpatient?.name || 'Unknown',
        age: result.lab_request?.visit?.outpatient?.age || 0,
        sex: result.lab_request?.visit?.outpatient?.sex || 'Unknown',
        contact_no: result.lab_request?.visit?.outpatient?.contact_no || 'Unknown'
      },
      visit_date: result.lab_request?.visit?.visit_date || null
    }));

    res.status(200).json({
      success: true,
      labResults: formattedResults
    });

  } catch (error) {
    console.error('Get lab results error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  app.get('/api/patient/lab-requests/:patientId', authenticateToken, async (req, res) => {
    try {
      if (req.user.type !== 'outpatient') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { patientId } = req.params;

      if (req.user.patientId !== patientId) {
        return res.status(403).json({ error: 'Access denied to other patient data' });
      }

      const { data: patientData } = await supabase
        .from('outpatient')
        .select('id, patient_id, name')
        .eq('patient_id', patientId)
        .single();

      if (!patientData) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const { data: visits } = await supabase
        .from('visit')
        .select('visit_id')
        .eq('patient_id', patientData.id);

      if (!visits || visits.length === 0) {
        return res.status(200).json({
          success: true,
          labRequests: []
        });
      }

      const visitIds = visits.map(v => v.visit_id);

      // FIXED: Show requests that are NOT completed (pending, submitted, declined)
      const { data: labRequests, error: labRequestsError } = await supabase
        .from('lab_request')
        .select(`
          *,
          visit!inner(visit_id, visit_date),
          staff!lab_request_staff_id_fkey(name, specialization)
        `)
        .in('visit_id', visitIds)
        .in('status', ['pending', 'submitted', 'declined'])
        .order('request_id', { ascending: false });

      if (labRequestsError) {
        console.error('Patient lab requests fetch error:', labRequestsError);
        return res.status(500).json({ error: 'Failed to fetch lab requests' });
      }

      const labRequestIds = labRequests.map(req => req.request_id);
      let labResults = [];
      
      if (labRequestIds.length > 0) {
        const { data: resultsData } = await supabase
          .from('lab_result')
          .select('*')
          .eq('patient_id', patientData.id)
          .in('request_id', labRequestIds);
        
        labResults = resultsData || [];
      }

      const formattedRequests = labRequests.map(request => {
        const labResult = labResults.find(result => result.request_id === request.request_id);
        
        return {
          request_id: request.request_id,
          test_name: request.test_type,
          test_type: request.test_type,
          priority: 'normal',
          status: request.status,
          instructions: '',
          due_date: request.due_date,
          created_at: request.visit.visit_date,
          doctor: {
            name: request.staff.name,
            department: request.staff.specialization
          },
          labResult: labResult ? {
            result_id: labResult.result_id,
            file_name: labResult.file_path ? labResult.file_path.split('/').pop() : 'Uploaded File',
            file_url: labResult.file_path,
            upload_date: labResult.upload_date,
            results: labResult.results
          } : null
        };
      });

      res.status(200).json({
        success: true,
        labRequests: formattedRequests
      });

    } catch (error) {
      console.error('Get patient lab requests error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  });

app.post('/api/patient/upload-lab-result', authenticateToken, upload.single('labResultFile'), async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { labRequestId, patientId } = req.body;
    const file = req.file;

    if (!file || !labRequestId || !patientId) {
      return res.status(400).json({ error: 'File, lab request ID and patient ID are required' });
    }

    if (req.user.patientId !== patientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id')
      .eq('patient_id', patientId)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: labRequestData } = await supabase
      .from('lab_request')
      .select('request_id, visit_id, status')
      .eq('request_id', labRequestId)
      .single();

    if (!labRequestData) {
      return res.status(404).json({ error: 'Lab request not found' });
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    const fileName = `${patientId}_${labRequestId}_${timestamp}${fileExt}`;

    const uploadResult = await uploadToSupabaseStorage(file.buffer, fileName, 'lab-results');

    // Get staff_id from the lab request
    const { data: requestInfo } = await supabase
      .from('lab_request')
      .select('staff_id')
      .eq('request_id', labRequestId)
      .single();

    const { data: labResultData, error: labResultError } = await supabase
      .from('lab_result')
      .insert({
        request_id: parseInt(labRequestId),
        patient_id: patientData.id,
        staff_id: requestInfo?.staff_id,
        file_path: uploadResult.publicUrl, // Store public URL
        upload_date: new Date().toISOString().split('T')[0],
        results: JSON.stringify({
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          storagePath: uploadResult.path
        })
      })
      .select()
      .single();

    if (labResultError) {
      console.error('Lab result save error:', labResultError);
      return res.status(500).json({ error: 'Failed to save lab result' });
    }

    await supabase
      .from('lab_request')
      .update({ status: 'submitted' })
      .eq('request_id', labRequestId);

    const { data: existingMedicalRecord } = await supabase
      .from('medical_record')
      .select('record_id')
      .eq('patient_id', patientData.id)
      .eq('visit_id', labRequestData.visit_id)
      .single();

    if (existingMedicalRecord) {
      await supabase
        .from('medical_record')
        .update({ 
          result_id: labResultData.result_id,
          updated_at: new Date().toISOString()
        })
        .eq('record_id', existingMedicalRecord.record_id);
    } else {
      await supabase
        .from('medical_record')
        .insert({
          patient_id: patientData.id,
          visit_id: labRequestData.visit_id,
          result_id: labResultData.result_id
        });
    }

    res.status(201).json({
      success: true,
      labResult: {
        result_id: labResultData.result_id,
        file_name: file.originalname,
        file_url: uploadResult.publicUrl, // Return public URL
        upload_date: labResultData.upload_date
      },
      message: 'Lab result uploaded and medical record updated successfully'
    });

  } catch (error) {
    console.error('Upload lab result error:', error);
    res.status(500).json({ error: 'Internal server error during file upload' });
  }
});

// Get or create visit for patient today
app.post('/api/healthcare/patient-visit', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patient_id } = req.body;

    if (!patient_id) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .eq('patient_id', patient_id)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    let { data: existingVisit } = await supabase
      .from('visit')
      .select('visit_id')
      .eq('patient_id', patientData.id)
      .eq('visit_date', today)
      .single();

    if (existingVisit) {
      return res.status(200).json({
        success: true,
        visit_id: existingVisit.visit_id,
        message: 'Existing visit found'
      });
    }

    const { data: newVisit, error: visitError } = await supabase
      .from('visit')
      .insert({
        patient_id: patientData.id,
        visit_date: today,
        visit_time: new Date().toTimeString().split(' ')[0],
        appointment_type: 'Diagnosis Consultation',
        symptoms: 'Diagnosis consultation'
      })
      .select()
      .single();

    if (visitError) {
      console.error('Visit creation error:', visitError);
      return res.status(500).json({ error: 'Failed to create visit record' });
    }

    res.status(201).json({
      success: true,
      visit_id: newVisit.visit_id,
      message: 'New visit created'
    });

  } catch (error) {
    console.error('Patient visit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload lab result by test (Patient side)
app.post('/api/patient/upload-lab-result-by-test', authenticateToken, upload.single('labResultFile'), async (req, res) => {
    try {
      if (req.user.type !== 'outpatient') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { labRequestId, patientId, testName } = req.body;
      const file = req.file;

      if (!file || !labRequestId || !patientId || !testName) {
        return res.status(400).json({ error: 'File, lab request ID, patient ID, and test name are required' });
      }

      if (req.user.patientId !== patientId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { data: patientData } = await supabase
        .from('outpatient')
        .select('id, patient_id')
        .eq('patient_id', patientId)
        .single();

      if (!patientData) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const { data: labRequestData } = await supabase
        .from('lab_request')
        .select('request_id, visit_id, status, test_type')
        .eq('request_id', labRequestId)
        .single();

      if (!labRequestData) {
        return res.status(404).json({ error: 'Lab request not found' });
      }

      // Upload to Supabase Storage
      const timestamp = Date.now();
      const fileExt = path.extname(file.originalname);
      const sanitizedTestName = testName.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${patientId}_${labRequestId}_${sanitizedTestName}_${timestamp}${fileExt}`;

      const uploadResult = await uploadToSupabaseStorage(file.buffer, fileName, 'lab-results');

      // Get staff_id from the lab request
      const { data: requestInfo } = await supabase
        .from('lab_request')
        .select('staff_id')
        .eq('request_id', labRequestId)
        .single();

      const { data: labResultData, error: labResultError } = await supabase
        .from('lab_result')
        .insert({
          request_id: parseInt(labRequestId),
          patient_id: patientData.id,
          staff_id: requestInfo?.staff_id || null,
          file_path: uploadResult.publicUrl, // Store public URL
          upload_date: new Date().toISOString().split('T')[0],
          results: JSON.stringify({
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            testName: testName,
            storagePath: uploadResult.path
          })
        })
        .select()
        .single();

      if (labResultError) {
        console.error('Lab result save error:', labResultError);
        return res.status(500).json({ error: 'Failed to save lab result' });
      }

      const testTypes = labRequestData.test_type.split(', ');
      const { data: uploadedResults } = await supabase
        .from('lab_result')
        .select('results')
        .eq('request_id', labRequestId);

      const uploadedTestNames = uploadedResults?.map(result => {
        try {
          return JSON.parse(result.results).testName;
        } catch {
          return null;
        }
      }).filter(Boolean) || [];

      if (uploadedTestNames.length >= testTypes.length) {
        await supabase
          .from('lab_request')
          .update({ status: 'submitted' })
          .eq('request_id', labRequestId);
      }

      const { data: existingMedicalRecord } = await supabase
        .from('medical_record')
        .select('record_id')
        .eq('patient_id', patientData.id)
        .eq('visit_id', labRequestData.visit_id)
        .single();

      if (existingMedicalRecord) {
        await supabase
          .from('medical_record')
          .update({ 
            result_id: labResultData.result_id,
            updated_at: new Date().toISOString()
          })
          .eq('record_id', existingMedicalRecord.record_id);
      } else {
        await supabase
          .from('medical_record')
          .insert({
            patient_id: patientData.id,
            visit_id: labRequestData.visit_id,
            result_id: labResultData.result_id
          });
      }

      res.status(201).json({
        success: true,
        labResult: {
          result_id: labResultData.result_id,
          file_name: file.originalname,
          file_url: uploadResult.publicUrl, // Return public URL
          upload_date: labResultData.upload_date,
          testName: testName
        },
        message: `Lab result for ${testName} uploaded successfully`
      });

    } catch (error) {
      console.error('Upload lab result by test error:', error);
      res.status(500).json({ error: 'Internal server error during file upload' });
    }
});

app.post('/api/healthcare/lab-result/accept', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    // Get patient info before updating
    const { data: labRequest } = await supabase
      .from('lab_request')
      .select(`
        request_id,
        test_type,
        visit!inner(
          outpatient!inner(
            patient_id,
            name,
            email
          )
        )
      `)
      .eq('request_id', requestId)
      .eq('staff_id', req.user.id)
      .single();

    const { error: updateError } = await supabase
      .from('lab_request')
      .update({ 
        status: 'completed',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('request_id', requestId)
      .eq('staff_id', req.user.id);

    if (updateError) {
      console.error('Error accepting lab result:', updateError);
      return res.status(500).json({ error: 'Failed to accept lab result' });
    }

    // Send email notification to patient
    if (labRequest) {
      try {
        await sendLabAcceptedEmail(
          labRequest.visit.outpatient.email,
          labRequest.visit.outpatient.name,
          {
            request_id: labRequest.request_id,
            test_type: labRequest.test_type
          }
        );
        console.log('✅ Lab accepted email sent to:', labRequest.visit.outpatient.email);
      } catch (emailError) {
        console.error('⚠️ Failed to send lab accepted email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Lab result accepted successfully'
    });

  } catch (error) {
    console.error('Accept lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Doctor declines lab result
app.post('/api/healthcare/lab-result/decline', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { requestId, reason } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    // Get patient info before updating
    const { data: labRequest } = await supabase
      .from('lab_request')
      .select(`
        request_id,
        test_type,
        visit!inner(
          outpatient!inner(
            patient_id,
            name,
            email
          )
        )
      `)
      .eq('request_id', requestId)
      .eq('staff_id', req.user.id)
      .single();

    const declineReason = reason || 'No reason provided';

    const { error: updateError } = await supabase
      .from('lab_request')
      .update({ 
        status: 'declined',
        decline_reason: declineReason,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('request_id', requestId)
      .eq('staff_id', req.user.id);

    if (updateError) {
      console.error('Error declining lab result:', updateError);
      return res.status(500).json({ error: 'Failed to decline lab result' });
    }

    // Send email notification to patient
    if (labRequest) {
      try {
        await sendLabDeclinedEmail(
          labRequest.visit.outpatient.email,
          labRequest.visit.outpatient.name,
          {
            request_id: labRequest.request_id,
            test_type: labRequest.test_type
          },
          declineReason
        );
        console.log('✅ Lab declined email sent to:', labRequest.visit.outpatient.email);
      } catch (emailError) {
        console.error('⚠️ Failed to send lab declined email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Lab result declined successfully'
    });

  } catch (error) {
    console.error('Decline lab result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient lab history
app.get('/api/patient/lab-history/:patientId', authenticateToken, async (req, res) => {
    try {
      if (req.user.type !== 'outpatient') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { patientId } = req.params;
      
      if (req.user.patientId !== patientId) {
        return res.status(403).json({ error: 'Access denied to other patient data' });
      }

      const { data: patientData } = await supabase
        .from('outpatient')
        .select('id, patient_id, name')
        .eq('patient_id', patientId)
        .single();

      if (!patientData) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // FIXED: Use specific relationship for staff
      const { data: labHistory, error: labHistoryError } = await supabase
        .from('lab_request')
        .select(`
          request_id,
          test_type,
          created_at,
          status,
          decline_reason,
          visit!inner(
            visit_date,
            outpatient!inner(patient_id)
          ),
          staff!lab_request_staff_id_fkey(
            name,
            specialization,
            department_id,
            department(
              name
            )
          ),
          lab_result(count)
        `)
        .eq('visit.outpatient.patient_id', patientId)
        .in('status', ['completed', 'declined'])
        .order('created_at', { ascending: false });

      if (labHistoryError) {
        console.error('Lab history fetch error:', labHistoryError);
        return res.status(500).json({ error: 'Failed to fetch lab history' });
      }

      const requestIds = (labHistory || []).map(req => req.request_id);
      let uploadDates = {};
      
      if (requestIds.length > 0) {
        const { data: uploadData } = await supabase
          .from('lab_result')
          .select('request_id, upload_date')
          .in('request_id', requestIds)
          .order('upload_date', { ascending: true });

        (uploadData || []).forEach(item => {
          if (!uploadDates[item.request_id]) {
            uploadDates[item.request_id] = item.upload_date;
          }
        });
      }

      const formattedHistory = (labHistory || []).map(request => ({
        request_id: request.request_id,
        test_name: request.test_type,
        test_type: request.test_type,
        request_date: request.created_at,
        completion_date: uploadDates[request.request_id] || null,
        status: request.status,
        decline_reason: request.decline_reason || null,
        file_count: request.lab_result?.[0]?.count || 0,
        doctor: {
          name: request.staff?.name || 'Unknown',
          specialization: request.staff?.specialization || 'Unknown',
          department: request.staff?.department?.name || 'Unknown'
        }
      }));

      res.status(200).json({
        success: true,
        labHistory: formattedHistory
      });

    } catch (error) {
      console.error('Get patient lab history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

// Get lab history files for a specific request
app.get('/api/patient/lab-history-files/:requestId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'outpatient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { requestId } = req.params;

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id')
      .eq('patient_id', req.user.patientId)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: labFiles, error: labFilesError } = await supabase
      .from('lab_result')
      .select(`
        result_id,
        file_path,
        upload_date,
        results,
        lab_request!inner(
          request_id,
          test_type
        )
      `)
      .eq('request_id', requestId)
      .eq('patient_id', patientData.id)
      .order('upload_date', { ascending: true });

    if (labFilesError) {
      console.error('Lab files fetch error:', labFilesError);
      return res.status(500).json({ error: 'Failed to fetch lab files' });
    }

    const formattedFiles = (labFiles || []).map(file => {
      let testName = file.lab_request.test_type;
      let fileName = 'Uploaded File';
      
      try {
        const parsedResults = JSON.parse(file.results);
        testName = parsedResults.testName || testName;
        fileName = parsedResults.originalName || fileName;
      } catch (e) {
        fileName = file.file_path ? file.file_path.split('/').pop() : fileName;
      }

      return {
        result_id: file.result_id,
        test_name: testName,
        file_name: fileName,
        file_path: file.file_path, // This is already the public URL
        upload_date: file.upload_date
      };
    });

    res.status(200).json({
      success: true,
      files: formattedFiles
    });

  } catch (error) {
    console.error('Get lab history files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed lab statistics
app.get('/api/healthcare/lab-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: labRequestStats } = await supabase
      .from('lab_request')
      .select('status')
      .eq('staff_id', req.user.id);

    const { count: totalFiles } = await supabase
      .from('lab_result')
      .select(`
        lab_request!inner(staff_id)
      `, { count: 'exact' })
      .eq('labRequest.staff_id', req.user.id);

    const stats = {
      totalRequests: labRequestStats?.length || 0,
      pendingRequests: labRequestStats?.filter(r => r.status === 'pending').length || 0,
      completedRequests: labRequestStats?.filter(r => r.status === 'completed').length || 0,
      totalFilesUploaded: totalFiles || 0
    };

    res.status(200).json({
      success: true,
      labStats: stats
    });

  } catch (error) {
    console.error('Lab stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/healthcare/my-patients-queue', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const filterDate = date || today;

    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    let allTodayPatients = [];
    const processedQueueIds = new Set(); // Track processed queue IDs to avoid duplicates

    // Get ALL queue entries for this department and date
    const { data: allQueueEntries, error: queueError } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        created_time,
        updated_at,
        completed_by,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          symptoms,
          appointment_type,
          outpatient!inner(
            id,
            patient_id,
            name,
            age,
            sex,
            contact_no,
            email
          )
        )
      `)
      .eq('department_id', staffData.department_id)
      .eq('visit.visit_date', filterDate)
      .order('queue_no', { ascending: true });

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return res.status(500).json({ error: 'Failed to fetch queue data' });
    }

    // Process all queue entries
    (allQueueEntries || []).forEach(item => {
      // Skip if we've already processed this queue entry
      if (processedQueueIds.has(item.queue_id)) {
        return;
      }

      const isActive = ['waiting', 'in_progress'].includes(item.status);
      const isCompletedByMe = item.status === 'completed' && item.completed_by === req.user.id;

      // Include if: 1) Currently active in queue, OR 2) Completed by me
      if (isActive || isCompletedByMe) {
        processedQueueIds.add(item.queue_id);
        
        allTodayPatients.push({
          patient_id: item.visit.outpatient.patient_id,
          name: item.visit.outpatient.name,
          age: item.visit.outpatient.age,
          sex: item.visit.outpatient.sex,
          contact_no: item.visit.outpatient.contact_no,
          email: item.visit.outpatient.email,
          lastVisit: item.visit.visit_date,
          lastSymptoms: item.visit.symptoms,
          queueStatus: item.status,
          queueNumber: item.queue_no,
          visitTime: item.visit.visit_time,
          isInQueue: isActive,
          completedAt: isCompletedByMe ? item.updated_at : null,
          visit_id: item.visit.visit_id,
          queue_id: item.queue_id,
          diagnosedByMe: isCompletedByMe
        });
      }
    });

    res.status(200).json({
      success: true,
      patients: allTodayPatients,
      summary: {
        total: allTodayPatients.length,
        inQueue: allTodayPatients.filter(p => p.isInQueue).length,
        completed: allTodayPatients.filter(p => !p.isInQueue).length,
        myDiagnoses: allTodayPatients.filter(p => p.diagnosedByMe).length
      },
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      }
    });

  } catch (error) {
    console.error('My patients queue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/healthcare/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    
    const { data: staffData } = await supabase
      .from('staff')
      .select('department_id, specialization')
      .eq('id', req.user.id)
      .single();

    if (!staffData) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    const { count: myPatientsToday } = await supabase
      .from('diagnosis')
      .select(`
        visit!inner(
          visit_date,
          queue!inner(department_id)
        )
      `, { count: 'exact' })
      .eq('staff_id', req.user.id)
      .eq('visit.visit_date', today)
      .eq('visit.queue.department_id', staffData.department_id);

    const { count: queueCount } = await supabase
      .from('queue')
      .select(`
        visit!inner(visit_date)
      `, { count: 'exact' })
      .eq('department_id', staffData.department_id)
      .in('status', ['waiting', 'in_progress'])
      .eq('visit.visit_date', today);

    const { count: totalLabRequests } = await supabase
      .from('lab_request')
      .select('*', { count: 'exact' })
      .eq('staff_id', req.user.id)
      .eq('status', 'completed');

    const totalTodayPatients = (myPatientsToday || 0) + (queueCount || 0);

    res.status(200).json({
      success: true,
      stats: {
        myPatientsToday: totalTodayPatients,
        totalLabResults: totalLabRequests || 0,
        breakdown: {
          consulted: myPatientsToday || 0,
          inQueue: queueCount || 0,
          total: totalTodayPatients
        }
      },
      department: {
        id: staffData.department_id,
        specialization: staffData.specialization
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create grouped lab request
app.post('/api/healthcare/lab-requests-grouped', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patient_id, test_requests, priority, instructions, due_date, group_name } = req.body;

    if (!patient_id || !test_requests || test_requests.length === 0) {
      return res.status(400).json({ error: 'Patient ID and test requests are required' });
    }

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id, name, email')
      .eq('patient_id', patient_id)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    let { data: visitData } = await supabase
      .from('visit')
      .select('visit_id')
      .eq('patient_id', patientData.id)
      .eq('visit_date', today)
      .single();

    if (!visitData) {
      const { data: newVisit, error: visitError } = await supabase
        .from('visit')
        .insert({
          patient_id: patientData.id,
          visit_date: today,
          visit_time: new Date().toTimeString().split(' ')[0],
          appointment_type: 'Lab Request',
          symptoms: 'Multiple lab tests requested'
        })
        .select()
        .single();

      if (visitError) {
        return res.status(500).json({ error: 'Failed to create visit record' });
      }
      visitData = newVisit;
    }

    const groupedTestName = test_requests.map(t => t.test_name).join(', ');
    const groupedTestType = test_requests.map(t => t.test_type).join(', ');

    const { data: labRequestData, error: labRequestError } = await supabase
      .from('lab_request')
      .insert({
        visit_id: visitData.visit_id,
        staff_id: req.user.id,
        test_type: groupedTestType,
        due_date: due_date,
        status: 'pending'
      })
      .select()
      .single();

    if (labRequestError) {
      console.error('Grouped lab request creation error:', labRequestError);
      return res.status(500).json({ error: 'Failed to create lab request' });
    }

    // Send email notification to patient
    try {
      await sendLabRequestEmail(patientData.email, patientData.name, {
        request_id: labRequestData.request_id,
        test_requests: test_requests,
        priority: priority || 'normal',
        due_date: due_date,
        instructions: instructions || ''
      });
      console.log('✅ Lab request email sent to:', patientData.email);
    } catch (emailError) {
      console.error('⚠️ Failed to send lab request email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      labRequest: labRequestData,
      testsCount: test_requests.length,
      message: 'Grouped lab request created successfully'
    });

  } catch (error) {
    console.error('Create grouped lab request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}); 

app.post('/api/healthcare/lab-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patient_id, test_name, test_type, priority, instructions, due_date } = req.body;

    if (!patient_id || !test_name || !test_type) {
      return res.status(400).json({ error: 'Patient ID, test name, and test type are required' });
    }

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .eq('patient_id', patient_id)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    let { data: visitData } = await supabase
      .from('visit')
      .select('visit_id')
      .eq('patient_id', patientData.id)
      .eq('visit_date', today)
      .single();

    if (!visitData) {
      const { data: newVisit, error: visitError } = await supabase
        .from('visit')
        .insert({
          patient_id: patientData.id,
          visit_date: today,
          visit_time: new Date().toTimeString().split(' ')[0],
          appointment_type: 'Lab Request',
          symptoms: 'Lab test requested'
        })
        .select()
        .single();

      if (visitError) {
        return res.status(500).json({ error: 'Failed to create visit record' });
      }
      visitData = newVisit;
    }

    const { data: labRequestData, error: labRequestError } = await supabase
      .from('lab_request')
      .insert({
        visit_id: visitData.visit_id,
        staff_id: req.user.id,
        test_type: test_type,
        due_date: due_date,
        status: 'pending'
      })
      .select()
      .single();

    if (labRequestError) {
      console.error('Lab request creation error:', labRequestError);
      return res.status(500).json({ error: 'Failed to create lab request' });
    }

    res.status(201).json({
      success: true,
      labRequest: labRequestData,
      message: 'Lab request created successfully'
    });

  } catch (error) {
    console.error('Create lab request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Static file serving
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// app.use('/uploads', (req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET');
//   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//   next();
// });

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: error.message 
  });
});

// Diagnosis and medical records
app.post('/api/healthcare/diagnosis', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { 
      visit_id, 
      patient_id, 
      diagnosis_code, 
      diagnosis_description, 
      diagnosis_type, 
      severity, 
      notes,
      result_id 
    } = req.body;

    if (!visit_id || !patient_id || !diagnosis_description) {
      return res.status(400).json({ error: 'Visit ID, patient ID, and diagnosis description are required' });
    }

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id')
      .eq('patient_id', patient_id)
      .single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: diagnosisData, error: diagnosisError } = await supabase
      .from('diagnosis')
      .insert({
        visit_id: parseInt(visit_id),
        patient_id: patientData.id,
        staff_id: req.user.id,
        diagnosis_code,
        diagnosis_description,
        diagnosis_type: diagnosis_type || 'primary',
        severity: severity || 'moderate',
        notes
      })
      .select()
      .single();

    if (diagnosisError) {
      console.error('Diagnosis creation error:', diagnosisError);
      return res.status(500).json({ error: 'Failed to create diagnosis' });
    }

    const { data: medicalRecordData, error: medicalRecordError } = await supabase
      .from('medical_record')
      .insert({
        patient_id: patientData.id,
        visit_id: parseInt(visit_id),
        result_id: result_id ? parseInt(result_id) : null
      })
      .select()
      .single();

    if (medicalRecordError) {
      console.error('Medical record creation error:', medicalRecordError);
    }

    res.status(201).json({
      success: true,
      diagnosis: diagnosisData,
      medicalRecord: medicalRecordData,
      message: 'Diagnosis and medical record created successfully'
    });

  } catch (error) {
    console.error('Create diagnosis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/healthcare/medical-records/:patientId', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'healthcare') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { patientId } = req.params;

    const { data: patientData } = await supabase
      .from('outpatient')
      .select('id, patient_id, name')
      .eq('patient_id', patientId)
.single();

    if (!patientData) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const { data: medicalRecords, error: medicalRecordsError } = await supabase
      .from('medical_record')
      .select(`
        *,
        visit!inner(
          visit_id,
          visit_date,
          visit_time,
          appointment_type,
          symptoms
        ),
        lab_result(
          result_id,
          file_path,
          upload_date,
          results,
          interpretation
        )
      `)
      .eq('patient_id', patientData.id)
      .order('created_at', { ascending: false });

    if (medicalRecordsError) {
      console.error('Medical records fetch error:', medicalRecordsError);
      return res.status(500).json({ error: 'Failed to fetch medical records' });
    }

    res.status(200).json({
      success: true,
      patient: {
        id: patientData.id,
        patient_id: patientData.patient_id,
        name: patientData.name
      },
      medicalRecords: medicalRecords || []
    });

  } catch (error) {
    console.error('Get medical records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Queue Display API - Get current queue status for TV monitor
app.get('/api/queue/display/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    // Get department info
    const { data: department, error: deptError } = await supabase
      .from('department')
      .select('name, is_scheduled, service_type, queue_color')
      .eq('department_id', departmentId)
      .single();

    if (deptError) {
      return res.status(404).json({ 
        success: false, 
        error: 'Department not found' 
      });
    }

    // Determine which queues to show based on department type
    let statusFilter = ['waiting', 'in_progress'];
    let dateFilter = today;

    // For scheduled subspecialties, also show 'scheduled' status for today
    if (department.is_scheduled && department.service_type === 'subspecialty') {
      statusFilter.push('scheduled');
    }

    // Get current patient being served (status = 'in_progress')
    const { data: currentPatient } = await supabase
      .from('queue')
      .select(`
        queue_no,
        status,
        scheduled_date,
        visit!inner(
          visit_date,
          outpatient!inner(
            name
          )
        )
      `)
      .eq('department_id', departmentId)
      .eq('status', 'in_progress')
      .eq('scheduled_date', dateFilter)
      .maybeSingle();

    // Get waiting patients
    const { data: waitingPatients } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        created_time,
        scheduled_date,
        visit!inner(
          visit_date,
          outpatient!inner(
            name
          )
        )
      `)
      .eq('department_id', departmentId)
      .in('status', statusFilter.filter(s => s !== 'in_progress'))
      .eq('scheduled_date', dateFilter)
      .order('queue_no', { ascending: true });

    // Calculate wait times
    const now = new Date();
    const formattedWaiting = (waitingPatients || []).map(patient => {
      const waitMinutes = Math.floor((now - new Date(patient.created_time)) / 60000);
      
      return {
        queue_id: patient.queue_id,
        queue_no: patient.queue_no,
        status: patient.status,
        wait_minutes: waitMinutes > 0 ? waitMinutes : 0,
        patient_name: patient.visit?.outpatient?.name || 'Unknown'
      };
    });

    // Get completed count for today
    const { count: completedCount } = await supabase
      .from('queue')
      .select('*', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('status', 'completed')
      .eq('scheduled_date', dateFilter);

    res.json({
      success: true,
      departmentName: department.name,
      departmentColor: department.queue_color || 'Gray',
      isScheduled: department.is_scheduled,
      serviceType: department.service_type,
      current: currentPatient ? {
        queue_no: currentPatient.queue_no,
        patient_name: currentPatient.visit?.outpatient?.name || 'Unknown'
      } : null,
      waiting: formattedWaiting,
      stats: {
        totalWaiting: formattedWaiting.length,
        totalServed: completedCount || 0,
        avgWaitTime: formattedWaiting.length > 0 
          ? Math.floor(formattedWaiting.reduce((sum, p) => sum + p.wait_minutes, 0) / formattedWaiting.length)
          : 0
      }
    });

  } catch (error) {
    console.error('Queue display API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Get all departments for queue display selection
app.get('/api/departments', async (req, res) => {
  try {
    const { data: departments, error } = await supabase
      .from('department')
      .select('department_id, name, queue_color, is_scheduled, service_type, status')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch departments' });
    }

    res.json({
      success: true,
      departments: departments || []
    });

  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/queue/by-date/:departmentId/:date', async (req, res) => {
  try {
    const { departmentId, date } = req.params;

    const { data: queueData, error } = await supabase
      .from('queue')
      .select(`
        queue_id,
        queue_no,
        status,
        scheduled_date,
        visit!inner(
          visit_id,
          visit_date,
          outpatient!inner(
            patient_id,
            name
          )
        )
      `)
      .eq('department_id', departmentId)
      .eq('scheduled_date', date)
      .order('queue_no', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch queue data' });
    }

    res.json({
      success: true,
      queue: queueData || [],
      totalInQueue: queueData?.length || 0
    });

  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Email: ${brevoApiInstance ? 'Brevo API configured' : 'Not configured'}`);
  console.log(`SMS: ${isSMSConfigured ? 'TextBee configured' : 'Not configured'}`);
  console.log(`Database: ${SUPABASE_URL ? 'Connected' : 'Not connected'}`);
});

process.on('SIGINT', async () => {
  await printServer.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down print server...');
  await printServer.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down print server...');
  await printServer.cleanup();
  process.exit(0);
});

module.exports = app;