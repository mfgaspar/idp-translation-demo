from fastapi import FastAPI

app = FastAPI(title="LLM Translation Tool API")


@app.get("/health")
def health():
    return {"status": "ok"}
