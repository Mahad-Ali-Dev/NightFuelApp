import sys
import os

# Add the pipeline directory to sys.path for importing local modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../services/ai-pipeline')))

from app.prompts.prompts import build_user_context

def test_regional_prompt():
    print("=== AI REGIONAL PROMPT VERIFICATION ===\n")
    
    skeleton = {"rules": {"caffeine_cutoff": "14:00"}}
    
    # Test cases for different regions
    regions = ['us', 'eu', 'ap']
    
    for region in regions:
        user_preferences = {
            "primaryGoal": "MUSCLE_GAIN",
            "region": region
        }
        
        prompt = build_user_context(skeleton, user_preferences)
        
        # Verify region is present in the prompt
        if f'"region": "{region}"' in prompt:
            print(f"✅ Region '{region}' correctly serialized in context.")
        else:
            print(f"❌ Region '{region}' MISSING from context.")
            print("Full prompt context snippet:", prompt[-200:])
            sys.exit(1)

    print("\nRegional Context Verification Passed!")

if __name__ == "__main__":
    test_regional_prompt()
