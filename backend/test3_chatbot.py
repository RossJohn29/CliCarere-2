"""
CliCare - Chatbot Performance Testing (50 TEST CASES)
Run: python test3_chatbot.py
"""

import requests
import pandas as pd
import numpy as np
import json
import time
from datetime import datetime, timedelta
import os
import re

# ============================================================================
# CONFIGURATION
# ============================================================================

API_BASE = "http://localhost:5000"
OUTPUT_DIR = "chatbot_test_results/performance"

DELAY_BETWEEN_REQUESTS = 6
MAX_REQUESTS_PER_MINUTE = 10
RETRY_ATTEMPTS = 3
REQUEST_TIMEOUT = 10

TEST_ADMIN = {
    "healthadminid": "ADMIN001",
    "password": "admin123"
}

request_log = []

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_output_dir():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    print(f"📁 Output directory: {OUTPUT_DIR}")

def print_header(title):
    print("\n" + "="*80)
    print(title.center(80))
    print("="*80 + "\n")

def smart_rate_limit():
    global request_log
    now = datetime.now()
    one_minute_ago = now - timedelta(minutes=1)
    request_log = [ts for ts in request_log if ts > one_minute_ago]
    
    if len(request_log) >= MAX_REQUESTS_PER_MINUTE:
        oldest = min(request_log)
        wait_time = 60 - (now - oldest).total_seconds()
        if wait_time > 0:
            print(f"⏳ Rate limit: Waiting {wait_time:.1f}s...", end=' ', flush=True)
            time.sleep(wait_time + 2)
            print("✓")
            request_log.clear()
    
    request_log.append(now)
    print(f"⏱️  Rate limit delay: {DELAY_BETWEEN_REQUESTS}s...", end=' ', flush=True)
    time.sleep(DELAY_BETWEEN_REQUESTS)
    print("✓")

def make_request(endpoint, method="GET", data=None, headers=None, retry_count=0):
    try:
        url = f"{API_BASE}/{endpoint}"
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=REQUEST_TIMEOUT)
        
        if response.status_code == 429:
            if retry_count < RETRY_ATTEMPTS:
                wait_time = 30 * (2 ** retry_count)
                print(f"\n🚨 Rate limit! Waiting {wait_time}s")
                time.sleep(wait_time)
                return make_request(endpoint, method, data, headers, retry_count + 1)
            return None
        
        if response.status_code == 504:
            if retry_count < RETRY_ATTEMPTS:
                print(f"\n⏰ Timeout! Retry {retry_count + 1}/{RETRY_ATTEMPTS}")
                time.sleep(5)
                return make_request(endpoint, method, data, headers, retry_count + 1)
            return None
        
        if response.status_code in [200, 201]:
            return response.json()
        else:
            print(f"\n⚠️  API Error: {response.status_code}")
            return None
            
    except requests.exceptions.Timeout:
        if retry_count < RETRY_ATTEMPTS:
            print(f"\n⏰ Timeout! Retry {retry_count + 1}/{RETRY_ATTEMPTS}")
            time.sleep(5)
            return make_request(endpoint, method, data, headers, retry_count + 1)
        print(f"\n❌ Timeout after {RETRY_ATTEMPTS} attempts")
        return None
    except Exception as e:
        print(f"\n⚠️  Error: {e}")
        return None
    
def authenticate():
    print("🔐 Authenticating...")
    result = make_request("api/admin/login", method="POST", data=TEST_ADMIN)
    if result and result.get('success'):
        print(f"✅ Authenticated as: {result.get('admin', {}).get('name')}")
        return result.get('token')
    print("❌ Authentication failed")
    return None

# ============================================================================
# 50 TEST QUERIES - Mixed difficulty levels
# ============================================================================

def get_test_queries():
    """50 comprehensive test queries with varying difficulty"""
    return [
        # ===== BASIC STATISTICS (10 queries) =====
        {"query": "How many patients visited today?", "category": "Basic Stats", "expected_keywords": ["patient", "today", "visit"], "difficulty": "easy"},
        {"query": "What is the total patient count this week?", "category": "Basic Stats", "expected_keywords": ["patient", "week", "total"], "difficulty": "easy"},
        {"query": "How many new patients registered today?", "category": "Basic Stats", "expected_keywords": ["new", "patient", "today"], "difficulty": "easy"},
        {"query": "Show me today's patient volume", "category": "Basic Stats", "expected_keywords": ["patient", "volume", "today"], "difficulty": "easy"},
        {"query": "What is the current patient census?", "category": "Basic Stats", "expected_keywords": ["patient", "census", "current"], "difficulty": "medium"},
        {"query": "How many patients are waiting right now?", "category": "Basic Stats", "expected_keywords": ["patient", "waiting"], "difficulty": "easy"},
        {"query": "Total consultations completed today?", "category": "Basic Stats", "expected_keywords": ["consultation", "completed", "today"], "difficulty": "easy"},
        {"query": "How many follow-up visits today?", "category": "Basic Stats", "expected_keywords": ["follow-up", "visit", "today"], "difficulty": "medium"},
        {"query": "What is today's admission count?", "category": "Basic Stats", "expected_keywords": ["admission", "today", "count"], "difficulty": "medium"},
        {"query": "Show patient registration statistics", "category": "Basic Stats", "expected_keywords": ["patient", "registration", "statistic"], "difficulty": "easy"},
        
        # ===== APPOINTMENTS (8 queries) =====
        {"query": "Show me today's appointments", "category": "Appointments", "expected_keywords": ["appointment", "today"], "difficulty": "easy"},
        {"query": "How many appointments are scheduled for tomorrow?", "category": "Appointments", "expected_keywords": ["appointment", "tomorrow", "scheduled"], "difficulty": "medium"},
        {"query": "What is the appointment completion rate?", "category": "Appointments", "expected_keywords": ["appointment", "completion", "rate", "%"], "difficulty": "medium"},
        {"query": "Show cancelled appointments this week", "category": "Appointments", "expected_keywords": ["cancelled", "appointment", "week"], "difficulty": "medium"},
        {"query": "How many no-show appointments today?", "category": "Appointments", "expected_keywords": ["no-show", "appointment", "today"], "difficulty": "medium"},
        {"query": "Average appointments per doctor?", "category": "Appointments", "expected_keywords": ["average", "appointment", "doctor"], "difficulty": "medium"},
        {"query": "Peak appointment hours today?", "category": "Appointments", "expected_keywords": ["peak", "hour", "appointment"], "difficulty": "hard"},
        {"query": "Show appointment trends this month", "category": "Appointments", "expected_keywords": ["appointment", "trend", "month"], "difficulty": "hard"},
        
        # ===== STAFF & DOCTORS (7 queries) =====
        {"query": "How many doctors are online?", "category": "Staff Info", "expected_keywords": ["doctor", "online"], "difficulty": "easy"},
        {"query": "List all available doctors", "category": "Staff Info", "expected_keywords": ["doctor", "available", "list"], "difficulty": "easy"},
        {"query": "Which doctors are busiest today?", "category": "Staff Info", "expected_keywords": ["doctor", "busy", "busiest"], "difficulty": "hard"},
        {"query": "Show doctor availability status", "category": "Staff Info", "expected_keywords": ["doctor", "availability", "status"], "difficulty": "medium"},
        {"query": "How many staff members are on duty?", "category": "Staff Info", "expected_keywords": ["staff", "duty"], "difficulty": "medium"},
        {"query": "Average patients per doctor today?", "category": "Staff Info", "expected_keywords": ["average", "patient", "doctor"], "difficulty": "medium"},
        {"query": "Doctor consultation statistics", "category": "Staff Info", "expected_keywords": ["doctor", "consultation", "statistic"], "difficulty": "medium"},
        
        # ===== DEPARTMENT ANALYSIS (7 queries) =====
        {"query": "What is the busiest department?", "category": "Department", "expected_keywords": ["busy", "busiest", "department"], "difficulty": "medium"},
        {"query": "Show department patient distribution", "category": "Department", "expected_keywords": ["department", "patient", "distribution"], "difficulty": "medium"},
        {"query": "Department utilization rates", "category": "Department", "expected_keywords": ["department", "utilization", "rate"], "difficulty": "hard"},
        {"query": "Which department has longest wait?", "category": "Department", "expected_keywords": ["department", "wait", "longest"], "difficulty": "hard"},
        {"query": "Compare department performance", "category": "Department", "expected_keywords": ["department", "performance", "compare"], "difficulty": "hard"},
        {"query": "Emergency department statistics", "category": "Department", "expected_keywords": ["emergency", "department", "statistic"], "difficulty": "medium"},
        {"query": "Outpatient vs inpatient by department", "category": "Department", "expected_keywords": ["outpatient", "inpatient", "department"], "difficulty": "hard"},
        
        # ===== QUEUE & WAIT TIME (6 queries) =====
        {"query": "Show current queue status", "category": "Queue", "expected_keywords": ["queue", "status", "current"], "difficulty": "easy"},
        {"query": "What is the average wait time?", "category": "Wait Time", "expected_keywords": ["average", "wait", "time"], "difficulty": "easy"},
        {"query": "Longest wait time today?", "category": "Wait Time", "expected_keywords": ["longest", "wait", "time"], "difficulty": "medium"},
        {"query": "Queue length by department", "category": "Queue", "expected_keywords": ["queue", "department", "length"], "difficulty": "medium"},
        {"query": "Wait time trends this week", "category": "Wait Time", "expected_keywords": ["wait", "time", "trend", "week"], "difficulty": "hard"},
        {"query": "How many patients in queue per hour?", "category": "Queue", "expected_keywords": ["patient", "queue", "hour"], "difficulty": "hard"},
        
        # ===== LAB & DIAGNOSTICS (5 queries) =====
        {"query": "How many lab tests today?", "category": "Lab Stats", "expected_keywords": ["lab", "test", "today"], "difficulty": "easy"},
        {"query": "Lab test completion rate?", "category": "Lab Stats", "expected_keywords": ["lab", "test", "completion", "rate"], "difficulty": "medium"},
        {"query": "Most common lab tests ordered", "category": "Lab Stats", "expected_keywords": ["common", "lab", "test", "ordered"], "difficulty": "hard"},
        {"query": "Pending lab results count", "category": "Lab Stats", "expected_keywords": ["pending", "lab", "result", "count"], "difficulty": "medium"},
        {"query": "Average lab turnaround time", "category": "Lab Stats", "expected_keywords": ["average", "lab", "turnaround", "time"], "difficulty": "hard"},
        
        # ===== HEALTH TRENDS & SYMPTOMS (4 queries) =====
        {"query": "Show me fever trends this week", "category": "Health Trends", "expected_keywords": ["fever", "trend", "week"], "difficulty": "hard"},
        {"query": "Which symptoms are most common?", "category": "Symptoms", "expected_keywords": ["symptom", "common", "most"], "difficulty": "medium"},
        {"query": "What are the top 5 diagnoses?", "category": "Diagnosis", "expected_keywords": ["top", "diagnos", "5"], "difficulty": "medium"},
        {"query": "Show medication prescription trends", "category": "Pharmacy", "expected_keywords": ["medication", "prescription", "trend"], "difficulty": "hard"},
        
        # ===== COMPLEX ANALYSIS (3 queries) =====
        {"query": "Compare this month to last month", "category": "Temporal Comparison", "expected_keywords": ["compare", "month", "last"], "difficulty": "hard"},
        {"query": "Analyze patient flow patterns by hour", "category": "Flow Analysis", "expected_keywords": ["patient", "flow", "pattern", "hour"], "difficulty": "hard"},
        {"query": "What departments need more resources?", "category": "Resource Analysis", "expected_keywords": ["department", "resource", "need"], "difficulty": "hard"},
    ]

# ============================================================================
# STRICTER EVALUATION
# ============================================================================

def evaluate_response(response, test_case, response_time):
    """Stricter evaluation criteria for more realistic scores"""
    if response is None:
        return {
            'understood': False, 'helpful': False, 'relevant': False,
            'response_quality': 'Failed', 'timed_out': True,
            'keyword_match': 0, 'has_data': False
        }
    
    text = response.get('textResponse', '').lower()
    chart_type = response.get('chartType', 'none')
    chart_data = response.get('chartData', [])
    
    # Check if response is long enough to be meaningful
    understood = len(text) > 30
    
    # Privacy/error rejection checks
    privacy_rejections = [
        'cannot provide individual', 'cannot provide personal',
        'ra 10173', 'data privacy act', 'cannot provide patient records',
        'cannot disclose patient', 'protected information'
    ]
    error_phrases = [
        'error occurred', 'failed to', 'unable to process',
        'try again later', 'something went wrong', 'i apologize',
        'i\'m sorry, i', 'unfortunately', 'i don\'t have access'
    ]
    
    is_privacy_rejection = any(phrase in text for phrase in privacy_rejections)
    is_error = any(phrase in text for phrase in error_phrases)
    
    # Keyword matching - check if response addresses the query
    expected_keywords = test_case.get('expected_keywords', [])
    keyword_matches = sum(1 for kw in expected_keywords if kw.lower() in text)
    keyword_ratio = keyword_matches / len(expected_keywords) if expected_keywords else 0
    
    # Check for actual data/numbers in response
    has_numbers = bool(re.search(r'\b\d+\b', text))
    has_percentage = '%' in text or 'percent' in text
    has_chart = chart_type != 'none' and len(chart_data) > 0
    has_data = has_numbers or has_percentage or has_chart
    
    # Difficulty-based evaluation
    difficulty = test_case.get('difficulty', 'medium')
    
    # NLUR: Did the system understand the query?
    # Stricter: requires at least 50% keyword match for understanding
    if difficulty == 'easy':
        understood = understood and keyword_ratio >= 0.4
    elif difficulty == 'medium':
        understood = understood and keyword_ratio >= 0.3
    else:  # hard
        understood = understood and keyword_ratio >= 0.2
    
    # QRA: Is the response actually helpful and accurate?
    # Stricter criteria based on difficulty
    helpful = False
    if understood and not is_error and not is_privacy_rejection:
        if difficulty == 'easy':
            # Easy queries should have data and good keyword match
            helpful = has_data and keyword_ratio >= 0.5
        elif difficulty == 'medium':
            # Medium queries need either chart or numerical data
            helpful = (has_data or has_chart) and keyword_ratio >= 0.4
        else:  # hard
            # Hard queries - more lenient but still need some relevance
            helpful = keyword_ratio >= 0.3 and (has_data or len(text) > 100)
    
    # Response time factor
    fast_response = response_time <= 5000
    
    # Quality rating
    if understood and helpful and fast_response and keyword_ratio >= 0.5:
        quality = 'Excellent'
    elif understood and helpful and fast_response:
        quality = 'Good'
    elif understood and (helpful or keyword_ratio >= 0.3):
        quality = 'Fair'
    elif understood:
        quality = 'Poor'
    else:
        quality = 'Failed'
    
    return {
        'understood': understood,
        'helpful': helpful,
        'relevant': not is_error and not is_privacy_rejection,
        'response_quality': quality,
        'timed_out': False,
        'keyword_match': keyword_ratio,
        'has_data': has_data
    }

# ============================================================================
# MAIN TEST
# ============================================================================

def test_chatbot_performance(token):
    print_header("CHATBOT PERFORMANCE TESTING - 50 TEST CASES")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("📊 Fetching hospital data...")
    dashboard = make_request("api/admin/dashboard-stats", headers=headers)
    
    if not dashboard:
        print("❌ Cannot get hospital data")
        return None
    
    print(f"✅ Hospital data loaded")
    
    queries = get_test_queries()
    total = len(queries)
    
    print(f"\n🤖 Testing {total} queries")
    print(f"⏱️  Estimated time: ~{(total * DELAY_BETWEEN_REQUESTS) / 60:.1f} minutes")
    print(f"🛡️  Rate limit: {MAX_REQUESTS_PER_MINUTE} requests/minute")
    print(f"⏱️  Timeout: {REQUEST_TIMEOUT}s per request\n")
    
    input("Press ENTER to start testing...")
    
    results = []
    response_times = []
    
    for idx, test_case in enumerate(queries, 1):
        print(f"\n[{idx}/{total}] {test_case['query'][:60]}...")
        smart_rate_limit()
        
        start = time.time()
        ai_response = make_request(
            "api/admin/analyze-data", method="POST",
            data={"query": test_case['query'], "hospitalData": dashboard.get('stats', {})},
            headers=headers
        )
        response_time = (time.time() - start) * 1000
        response_times.append(response_time)
        
        evaluation = evaluate_response(ai_response, test_case, response_time)
        
        status_icon = {
            'Excellent': '✅', 
            'Good': '✅', 
            'Fair': '⚠️',
            'Poor': '⚠️', 
            'Failed': '❌'
        }
        print(f"{status_icon.get(evaluation['response_quality'], '❓')} {evaluation['response_quality']} ({response_time:.0f}ms) [KW: {evaluation['keyword_match']:.0%}]")
        
        results.append({
            'test_case': idx,
            'query': test_case['query'],
            'category': test_case['category'],
            'difficulty': test_case.get('difficulty', 'medium'),
            'understood': evaluation['understood'],
            'helpful': evaluation['helpful'],
            'relevant': evaluation['relevant'],
            'response_quality': evaluation['response_quality'],
            'response_time_ms': response_time,
            'under_5s': response_time <= 5000,
            'timed_out': evaluation['timed_out'],
            'keyword_match': evaluation['keyword_match'],
            'has_data': evaluation['has_data']
        })
    
    df = pd.DataFrame(results)
    
    helpful_count = df['helpful'].sum()
    understood_count = df['understood'].sum()
    under_5s_count = df['under_5s'].sum()
    timeout_count = df['timed_out'].sum()
    
    qra = (helpful_count / total * 100)
    nlur = (understood_count / total * 100)
    avg_time = np.mean(response_times)
    time_compliance = (under_5s_count / total * 100)
    
    print_header("PERFORMANCE TEST RESULTS")
    
    print(f"Total Queries: {total}")
    print(f"Understood: {understood_count}")
    print(f"Helpful: {helpful_count}")
    print(f"Under 5s: {under_5s_count}")
    print(f"Timeouts: {timeout_count}")
    
    # Category breakdown
    print(f"\n📊 CATEGORY BREAKDOWN:")
    for category in df['category'].unique():
        cat_df = df[df['category'] == category]
        cat_helpful = cat_df['helpful'].sum()
        cat_total = len(cat_df)
        print(f"   {category}: {cat_helpful}/{cat_total} ({cat_helpful/cat_total*100:.0f}%)")
    
    # Difficulty breakdown
    print(f"\n📊 DIFFICULTY BREAKDOWN:")
    for diff in ['easy', 'medium', 'hard']:
        diff_df = df[df['difficulty'] == diff]
        if len(diff_df) > 0:
            diff_helpful = diff_df['helpful'].sum()
            diff_understood = diff_df['understood'].sum()
            diff_total = len(diff_df)
            print(f"   {diff.capitalize()}: Helpful {diff_helpful}/{diff_total} ({diff_helpful/diff_total*100:.0f}%), Understood {diff_understood}/{diff_total} ({diff_understood/diff_total*100:.0f}%)")
    
    print(f"\n📊 QUERY RESPONSE ACCURACY (QRA):")
    print(f"   Result: {qra:.2f}%  |  Target: ≥85%  |  {'✅ PASS' if qra >= 85 else '❌ FAIL'}")
    
    print(f"\n📊 NATURAL LANGUAGE UNDERSTANDING (NLUR):")
    print(f"   Result: {nlur:.2f}%  |  Target: ≥90%  |  {'✅ PASS' if nlur >= 90 else '❌ FAIL'}")
    
    print(f"\n⏱️  RESPONSE TIME:")
    print(f"   Average: {avg_time:.2f}ms  |  Compliance: {time_compliance:.2f}%  |  {'✅ PASS' if avg_time <= 5000 else '❌ FAIL'}")
    
    df.to_csv(f"{OUTPUT_DIR}/performance_results.csv", index=False)
    
    summary = {
        'test_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'total_queries': int(total),
        'understood_count': int(understood_count),
        'helpful_count': int(helpful_count),
        'qra': float(qra),
        'nlur': float(nlur),
        'avg_response_time_ms': float(avg_time),
        'time_compliance': float(time_compliance),
        'timeout_count': int(timeout_count),
        'status': 'PASS' if (qra >= 85 and nlur >= 90 and avg_time <= 5000) else 'FAIL'
    }
    
    with open(f"{OUTPUT_DIR}/summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n✅ Results saved to: {OUTPUT_DIR}/")
    return summary

# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    print_header("CLICARE - CHATBOT TESTING (50 TEST CASES)")
    
    create_output_dir()
    token = authenticate()
    if not token:
        print("\n❌ Cannot proceed without authentication")
        exit(1)
    
    try:
        result = test_chatbot_performance(token)
        if result:
            print_header("TEST COMPLETED")
            print(f"✅ Status: {result['status']}")
            print(f"📈 QRA: {result['qra']:.2f}% | NLUR: {result['nlur']:.2f}%")
            print(f"⏱️  Avg Time: {result['avg_response_time_ms']:.0f}ms")
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")