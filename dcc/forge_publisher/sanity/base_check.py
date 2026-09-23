"""
base_check.py — Abstract base class for all DCC sanity checks.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class CheckStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    WARNING = "warning"
    FAILED = "failed"


@dataclass
class CheckResult:
    """The outcome of a single sanity check run."""

    status: CheckStatus
    message: str
    details: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "message": self.message,
            "details": self.details,
        }


class SanityCheck(ABC):
    """
    Abstract base class for all sanity checks.

    Subclasses must define:
      - ``name``        (class attribute, str)
      - ``description`` (class attribute, str)
      - ``run()``       returns a CheckResult
    """

    name: str = "Unnamed Check"
    description: str = "No description provided."

    @abstractmethod
    def run(self) -> CheckResult:
        """Execute the check and return a CheckResult."""
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Convenience helpers subclasses may call
    # ------------------------------------------------------------------

    @staticmethod
    def passed(message: str, details: Optional[str] = None) -> CheckResult:
        return CheckResult(CheckStatus.PASSED, message, details)

    @staticmethod
    def failed(message: str, details: Optional[str] = None) -> CheckResult:
        return CheckResult(CheckStatus.FAILED, message, details)

    @staticmethod
    def warning(message: str, details: Optional[str] = None) -> CheckResult:
        return CheckResult(CheckStatus.WARNING, message, details)

    @staticmethod
    def pending() -> CheckResult:
        return CheckResult(CheckStatus.PENDING, "Not yet run.")

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} name={self.name!r}>"
