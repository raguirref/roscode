"""Command-line entry point for roscode."""

from __future__ import annotations

from pathlib import Path

import click

from roscode.agent import run
from roscode.config import load_settings


@click.command(context_settings={"help_option_names": ["-h", "--help"]})
@click.argument("request", required=False)
@click.option(
    "--workspace",
    "-w",
    type=click.Path(file_okay=False, dir_okay=True, path_type=Path),
    default=None,
    help="Path to the active ROS 2 workspace. Falls back to ROSCODE_WORKSPACE.",
)
@click.option(
    "--model",
    default=None,
    help="Claude model ID. Default: claude-opus-4-7.",
)
@click.option(
    "--max-iterations",
    type=int,
    default=None,
    help="Max agent loop iterations. Default: 20.",
)
@click.option(
    "--no-confirm",
    is_flag=True,
    default=False,
    help="Skip the confirmation gate for destructive tools. DANGEROUS — testing only.",
)
@click.option(
    "--interactive",
    "-i",
    is_flag=True,
    default=False,
    help="Interactive mode: keep prompting for requests until the user exits.",
)
def main(
    request: str | None,
    workspace: Path | None,
    model: str | None,
    max_iterations: int | None,
    no_confirm: bool,
    interactive: bool,
) -> None:
    """roscode — debug and extend ROS 2 robots with natural language."""
    settings = load_settings()
    ws = workspace or settings.workspace
    iters = max_iterations or settings.max_iterations

    if interactive or request is None:
        click.echo("roscode interactive mode. Ctrl-D or blank line to exit.\n")
        while True:
            try:
                prompt = click.prompt(">>>", default="", show_default=False).strip()
            except (click.exceptions.Abort, EOFError):
                click.echo()
                return
            if not prompt:
                return
            run(
                user_request=prompt,
                workspace_path=str(ws),
                model=model,
                max_iterations=iters,
                auto_confirm=no_confirm,
            )
        return

    run(
        user_request=request,
        workspace_path=str(ws),
        model=model,
        max_iterations=iters,
        auto_confirm=no_confirm,
    )


if __name__ == "__main__":
    main()
