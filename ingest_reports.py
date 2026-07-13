"""
ingest_reports.py — CLI Utility for PDF Medical Report Ingestion
Run once to populate the vector database with patient medical reports.

Usage:
    python ingest_reports.py /path/to/report1.pdf /path/to/report2.pdf

Or ingest all PDFs in a directory:
    python ingest_reports.py --dir /path/to/reports/
"""

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest PDF medical reports into the vector database."
    )
    parser.add_argument(
        "pdf_files",
        nargs="*",
        help="Paths to individual PDF files to ingest.",
    )
    parser.add_argument(
        "--dir",
        type=str,
        default=None,
        help="Directory path — ingest all *.pdf files found inside.",
    )
    args = parser.parse_args()

    pdf_paths: list[str] = list(args.pdf_files)

    # Collect PDFs from a directory if --dir is specified
    if args.dir:
        dir_path = Path(args.dir)
        if not dir_path.is_dir():
            logger.error("Directory not found: %s", args.dir)
            sys.exit(1)
        pdf_paths.extend([str(p) for p in dir_path.glob("*.pdf")])

    if not pdf_paths:
        logger.error("No PDF files provided. Use --help for usage information.")
        sys.exit(1)

    logger.info("📄 Starting ingestion of %d PDF file(s)...", len(pdf_paths))

    from app.vector_store import ingest_pdf_documents
    total_chunks = ingest_pdf_documents(pdf_paths)

    logger.info("✅ Ingestion complete. Total chunks stored: %d", total_chunks)


if __name__ == "__main__":
    main()
