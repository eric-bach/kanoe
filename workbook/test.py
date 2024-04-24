import json

event = {
    'trace': {
        'trace': 'data', 
        'sessionId': '123456'
    }
}
#conversation = {'messages': [], 'traces': {}} 
conversation = {'messages': [], 'traces': {'999999': ['test data']}}
#conversation = {'messages': [], 'traces': {'123456': ['original data'], '999999': ['test data']}}

print("🔔🔔 Full Trace", json.dumps(event['trace']))
trace = event['trace']['trace']
print("🔔 Trace", trace)
sessionId = event['trace']['sessionId']
print("👉 Session", sessionId)

if not conversation["traces"]:
    print("Creating a new trace")
    conversation["traces"][sessionId] = [trace]
else:
    if not conversation["traces"].get(sessionId):
        print("Creating a new session")
        conversation["traces"][sessionId] = [trace]
    else:
        print("Appending to existing trace")
        conversation["traces"][sessionId].append(trace)

print("FINAL", conversation)
