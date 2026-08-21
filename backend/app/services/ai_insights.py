import os
import requests
import json

def generate_insights(stats: dict) -> str:
    api_key = os.getenv('GEMINI_API_KEY')
    
    # Fallback Rule-Based Engine
    def rule_based_fallback():
        cap = stats.get('capacity', 0) or 1
        regs = stats.get('totalRegistrations', 0)
        checked_in = stats.get('checkedInCount', 0)
        
        fill_rate = (regs / cap) * 100
        attendance_rate = (checked_in / regs) * 100 if regs > 0 else 0
        
        insight = ""
        if fill_rate >= 100:
            insight += f"Event is at full capacity with {regs} registrations! Prepare to manage the waitlist. "
        elif fill_rate > 80:
            insight += f"Event is nearly full ({fill_rate:.1f}% capacity). "
        else:
            insight += f"Currently at {fill_rate:.1f}% capacity. Consider a final marketing push. "
            
        if checked_in > 0:
            if attendance_rate > 80:
                insight += f"Turnout is excellent at {attendance_rate:.1f}%. Outstanding engagement!"
            elif attendance_rate < 30:
                insight += f"Turnout is currently low ({attendance_rate:.1f}%). Consider sending a reminder ping."
            else:
                insight += f"Attendance is steady with {checked_in} check-ins so far."
                
        if stats.get('peakCheckInTime') and stats.get('peakCheckInTime') != "N/A":
            insight += f" Peak rush was around {stats.get('peakCheckInTime')}."
            
        return insight

    if not api_key:
        return rule_based_fallback()

    prompt = f"""
    Analyze the following event check-in statistics and provide a brief, actionable 2-sentence summary for the event organizer.
    Do not use complex terminology. Focus on capacity, turnout, and waitlist management if applicable.
    
    Stats:
    Total Capacity: {stats.get('capacity')}
    Total Registered: {stats.get('totalRegistrations')}
    Active Registrations: {stats.get('registeredCount')}
    Waitlisted: {stats.get('waitlistedCount')}
    Checked In: {stats.get('checkedInCount')}
    Cancelled: {stats.get('cancelledCount')}
    Peak Check-in Time: {stats.get('peakCheckInTime')}
    """

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }

    try:
        response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'}, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if 'candidates' in data and len(data['candidates']) > 0:
            return data['candidates'][0]['content']['parts'][0]['text']
        else:
            return rule_based_fallback()
    except Exception as e:
        print(f"AI API call failed, using fallback: {str(e)}")
        return rule_based_fallback()
