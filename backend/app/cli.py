"""Command Line Interface for DW Migration Assistant"""

import typer
from typing import Optional
from rich.console import Console
from rich.table import Table
from rich.syntax import Syntax
from rich.panel import Panel
import requests
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = typer.Typer(help="DW Migration Assistant CLI")
console = Console()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

@app.command()
def translate(
    source_system: str = typer.Option(..., "--source", "-s", help="Source data warehouse system"),
    sql_file: Optional[str] = typer.Option(None, "--file", "-f", help="Path to SQL file"),
    sql_text: Optional[str] = typer.Option(None, "--sql", help="SQL text to translate"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path"),
):
    """Translate SQL from source system to Databricks SQL"""

    if not sql_file and not sql_text:
        console.print("[red]Error: Either --file or --sql must be provided[/red]")
        raise typer.Exit(1)

    # Read SQL from file or use provided text
    source_sql = sql_text
    if sql_file:
        try:
            with open(sql_file, 'r') as f:
                source_sql = f.read()
        except Exception as e:
            console.print(f"[red]Error reading file: {e}[/red]")
            raise typer.Exit(1)

    console.print(f"[cyan]Translating SQL from {source_system} to Databricks SQL...[/cyan]")

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/translate-sql",
            json={
                "sourceSystem": source_system,
                "sourceSql": source_sql
            }
        )

        if response.status_code == 200:
            result = response.json()
            if result["success"]:
                translated_sql = result["translatedSql"]

                # Display result
                syntax = Syntax(translated_sql, "sql", theme="monokai", line_numbers=True)
                console.print(Panel(syntax, title="Translated SQL", border_style="green"))

                # Show warnings if any
                if result.get("warnings"):
                    console.print("\n[yellow]Warnings:[/yellow]")
                    for warning in result["warnings"]:
                        console.print(f"  • {warning}")

                # Save to file if output specified
                if output:
                    with open(output, 'w') as f:
                        f.write(translated_sql)
                    console.print(f"\n[green]Saved to: {output}[/green]")

            else:
                console.print(f"[red]Translation failed: {result.get('error')}[/red]")
                raise typer.Exit(1)
        else:
            console.print(f"[red]API error: {response.status_code}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

@app.command()
def execute(
    sql_file: Optional[str] = typer.Option(None, "--file", "-f", help="Path to SQL file"),
    sql_text: Optional[str] = typer.Option(None, "--sql", help="SQL text to execute"),
    catalog: str = typer.Option("main", "--catalog", "-c", help="Unity Catalog name"),
    schema: str = typer.Option("default", "--schema", help="Schema name"),
):
    """Execute SQL in Databricks SQL"""

    if not sql_file and not sql_text:
        console.print("[red]Error: Either --file or --sql must be provided[/red]")
        raise typer.Exit(1)

    # Read SQL from file or use provided text
    sql = sql_text
    if sql_file:
        try:
            with open(sql_file, 'r') as f:
                sql = f.read()
        except Exception as e:
            console.print(f"[red]Error reading file: {e}[/red]")
            raise typer.Exit(1)

    console.print(f"[cyan]Executing SQL in {catalog}.{schema}...[/cyan]")

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/execute-sql",
            json={
                "sql": sql,
                "catalog": catalog,
                "schema": schema
            }
        )

        if response.status_code == 200:
            result = response.json()
            if result["success"]:
                console.print("[green]✓ Execution successful![/green]")
                console.print(f"Rows: {result.get('rowCount', 0)}")
                console.print(f"Time: {result.get('executionTime', 0)}s")

                # Display results if any
                if result.get("result"):
                    console.print("\n[cyan]Results:[/cyan]")
                    console.print(json.dumps(result["result"], indent=2))

            else:
                console.print(f"[red]Execution failed: {result.get('error')}[/red]")
                raise typer.Exit(1)
        else:
            console.print(f"[red]API error: {response.status_code}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

@app.command()
def convert_ddl(
    source_system: str = typer.Option(..., "--source", "-s", help="Source data warehouse system"),
    ddl_file: Optional[str] = typer.Option(None, "--file", "-f", help="Path to DDL file"),
    ddl_text: Optional[str] = typer.Option(None, "--ddl", help="DDL text to convert"),
    catalog: str = typer.Option("main", "--catalog", "-c", help="Unity Catalog name"),
    schema: str = typer.Option("default", "--schema", help="Schema name"),
    execute: bool = typer.Option(False, "--execute", "-e", help="Execute immediately"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path"),
):
    """Convert DDL from source system to Databricks SQL"""

    if not ddl_file and not ddl_text:
        console.print("[red]Error: Either --file or --ddl must be provided[/red]")
        raise typer.Exit(1)

    # Read DDL from file or use provided text
    source_ddl = ddl_text
    if ddl_file:
        try:
            with open(ddl_file, 'r') as f:
                source_ddl = f.read()
        except Exception as e:
            console.print(f"[red]Error reading file: {e}[/red]")
            raise typer.Exit(1)

    console.print(f"[cyan]Converting DDL from {source_system} to Databricks SQL...[/cyan]")

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/convert-ddl",
            json={
                "sourceSystem": source_system,
                "sourceDdl": source_ddl,
                "targetCatalog": catalog,
                "targetSchema": schema,
                "executeImmediately": execute
            }
        )

        if response.status_code == 200:
            result = response.json()
            if result["success"]:
                converted_ddl = result["convertedDdl"]

                # Display result
                syntax = Syntax(converted_ddl, "sql", theme="monokai", line_numbers=True)
                console.print(Panel(syntax, title="Converted DDL", border_style="green"))

                # Show warnings if any
                if result.get("warnings"):
                    console.print("\n[yellow]Warnings:[/yellow]")
                    for warning in result["warnings"]:
                        console.print(f"  • {warning}")

                # Show execution status
                if result.get("executed"):
                    console.print(f"\n[green]✓ DDL executed successfully in {catalog}.{schema}[/green]")

                # Save to file if output specified
                if output:
                    with open(output, 'w') as f:
                        f.write(converted_ddl)
                    console.print(f"\n[green]Saved to: {output}[/green]")

            else:
                console.print(f"[red]Conversion failed: {result.get('error')}[/red]")
                raise typer.Exit(1)
        else:
            console.print(f"[red]API error: {response.status_code}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

@app.command()
def list_catalogs():
    """List Unity Catalog catalogs and schemas"""
    console.print("[cyan]Fetching Unity Catalog information...[/cyan]")

    try:
        response = requests.get(f"{API_BASE_URL}/api/catalogs-schemas")

        if response.status_code == 200:
            result = response.json()

            for catalog in result["catalogs"]:
                console.print(f"\n[bold cyan]{catalog}[/bold cyan]")
                schemas = result["schemas"].get(catalog, [])
                for schema in schemas:
                    console.print(f"  └─ {schema}")

        else:
            console.print(f"[red]API error: {response.status_code}[/red]")
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)

@app.command()
def version():
    """Show version information"""
    console.print("[bold cyan]DW Migration Assistant CLI[/bold cyan]")
    console.print("Version: 1.0.0")

if __name__ == "__main__":
    app()
