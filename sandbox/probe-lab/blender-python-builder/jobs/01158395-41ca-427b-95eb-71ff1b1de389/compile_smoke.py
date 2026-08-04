import bpy
import json
import pathlib
import sys

MARKER = "MYWAY_COMPILE_SMOKE:"

def check(stage, target):
    try:
        source = pathlib.Path(target).read_text(encoding="utf-8")
        compile(source, target, "exec")
    except SyntaxError as error:
        payload = {
            "valid": False,
            "stage": stage,
            "message": str(error),
            "line": error.lineno,
            "offset": error.offset,
            "text": error.text.strip() if error.text else None,
        }
        print(MARKER + json.dumps(payload))
        raise

check("model_source", "C:\\Users\\willc\\projects\\MyWay\\v1\\sandbox\\probe-lab\\blender-python-builder\\jobs\\01158395-41ca-427b-95eb-71ff1b1de389\\source_code.py")
check("assembled_script", "C:\\Users\\willc\\projects\\MyWay\\v1\\sandbox\\probe-lab\\blender-python-builder\\jobs\\01158395-41ca-427b-95eb-71ff1b1de389\\build_asset.py")
print(MARKER + json.dumps({
    "valid": True,
    "stage": "assembled_script",
    "message": "Model source and assembled Foundry script compile in the configured Blender runtime.",
    "line": None,
    "offset": None,
    "text": None,
}))
