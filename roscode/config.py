"""Runtime configuration for roscode. Reads from env vars and .env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    workspace: Path = Field(default=Path.home() / "ros2_ws", alias="ROSCODE_WORKSPACE")
    model: str = Field(default="claude-opus-4-7", alias="ROSCODE_MODEL")
    max_iterations: int = Field(default=20, alias="ROSCODE_MAX_ITERATIONS")


def load_settings() -> Settings:
    return Settings()
