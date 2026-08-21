import json
import os

transcript_path = r'C:\Users\ishan\.gemini\antigravity-ide\brain\290a5a9c-73d5-4d45-8bef-49d577befa66\.system_generated\logs\transcript_full.jsonl'
files = {}

for line in open(transcript_path, 'r', encoding='utf-8'):
    try:
        step = json.loads(line)
        if 'tool_calls' in step:
            for tc in step['tool_calls']:
                name = tc['name'].replace('default_api:', '')
                args = tc['args']
                if name == 'write_to_file':
                    target = args['TargetFile']
                    if 'vite_app' in target:
                        new_target = target.replace('vite_app\\', '')
                        files[new_target] = args['CodeContent']
                elif name == 'replace_file_content':
                    target = args['TargetFile']
                    if 'vite_app' in target:
                        new_target = target.replace('vite_app\\', '')
                        if new_target in files:
                            content = files[new_target].split('\n')
                            start = args['StartLine'] - 1
                            end = args['EndLine']
                            # simple replacement assuming exact lines
                            replacement = args['ReplacementContent'].split('\n')
                            files[new_target] = '\n'.join(content[:start] + replacement + content[end:])
    except Exception as e:
        pass

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Recovered {path}")
