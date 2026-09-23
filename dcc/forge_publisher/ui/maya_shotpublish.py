"""
maya_shotpublish.py — "Shot Publish" tool window for Maya.

Reproduces the studio's existing Shot Publish tool: Episode/Seq/Shot fields,
a Publish Type dropdown (07_layout / 08_animation), a Cache checkbox, a
read-only Owner field, a check list with a status dot per check, and
Sanity Check / Publish buttons -- Publish stays disabled until every check
in the list has passed (warnings are allowed through; failures are not).

Launch from Maya's Script Editor:
    from forge_publisher.ui.maya_shotpublish import show
    show()
"""

import getpass
import logging

try:
    from PySide2 import QtCore, QtGui, QtWidgets
    from shiboken2 import wrapInstance
except ImportError:
    # Maya 2025+ ships Qt6 (PySide6/shiboken6) instead.
    from PySide6 import QtCore, QtGui, QtWidgets
    from shiboken6 import wrapInstance

import maya.OpenMayaUI as omui

from ..sanity.base_check import CheckStatus
from ..sanity.registry import get_check_classes
from ..publish import run_sanity_checks, all_checks_passed_or_warned, publish_shot
from ..config import get_forge_email

log = logging.getLogger(__name__)

_STATUS_COLORS = {
    CheckStatus.PENDING: QtGui.QColor("#9e9e9e"),
    CheckStatus.RUNNING: QtGui.QColor("#2196f3"),
    CheckStatus.PASSED: QtGui.QColor("#4caf50"),
    CheckStatus.WARNING: QtGui.QColor("#ff9800"),
    CheckStatus.FAILED: QtGui.QColor("#f44336"),
}


def _maya_main_window():
    ptr = omui.MQtUtil.mainWindow()
    if ptr is None:
        return None
    return wrapInstance(int(ptr), QtWidgets.QWidget)


def _current_owner():
    """Best-effort artist identity for the read-only Owner field, matching
    the studio's existing tool's "firstname.employeeid"-style display --
    prefers the Forge login email's local part (e.g. "dilip.e04220" from
    "dilip.e04220@symbiosystech.com"), falling back to the OS username."""
    email = get_forge_email()
    if email and "@" in email:
        return email.split("@", 1)[0]
    try:
        return getpass.getuser()
    except Exception:
        return ""


class _StatusDotDelegate(QtWidgets.QStyledItemDelegate):
    """Draws a colored status dot in front of each check's name, matching
    the reference tool's list style."""

    def paint(self, painter, option, index):
        painter.save()
        status = index.data(QtCore.Qt.UserRole) or CheckStatus.PENDING
        color = _STATUS_COLORS.get(status, _STATUS_COLORS[CheckStatus.PENDING])
        rect = option.rect

        if option.state & QtWidgets.QStyle.State_Selected:
            painter.fillRect(rect, option.palette.highlight())

        dot_size = 10
        dot_rect = QtCore.QRect(
            rect.left() + 8,
            rect.top() + (rect.height() - dot_size) // 2,
            dot_size,
            dot_size,
        )
        painter.setRenderHint(QtGui.QPainter.Antialiasing)
        painter.setBrush(QtGui.QBrush(color))
        painter.setPen(QtCore.Qt.NoPen)
        painter.drawEllipse(dot_rect)

        text_rect = QtCore.QRect(rect)
        text_rect.setLeft(dot_rect.right() + 10)
        text_color = (
            option.palette.highlightedText().color()
            if option.state & QtWidgets.QStyle.State_Selected
            else option.palette.text().color()
        )
        painter.setPen(text_color)
        painter.drawText(
            text_rect, QtCore.Qt.AlignVCenter | QtCore.Qt.AlignLeft, index.data(QtCore.Qt.DisplayRole)
        )
        painter.restore()

    def sizeHint(self, option, index):
        size = super().sizeHint(option, index)
        return QtCore.QSize(size.width(), max(size.height(), 22))


class ShotPublishWindow(QtWidgets.QDialog):

    OBJECT_NAME = "ForgeShotPublishWindow"

    def __init__(self, parent=None):
        super().__init__(parent or _maya_main_window())
        self.setObjectName(self.OBJECT_NAME)
        self.setWindowTitle("Shot Publish")
        self.setMinimumSize(670, 620)
        self._sanity_results = []
        self._build_ui()
        self._connect_signals()
        self._on_publish_type_changed(self.publish_type_combo.currentText())

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QtWidgets.QVBoxLayout(self)

        row1 = QtWidgets.QHBoxLayout()
        self.episode_edit = QtWidgets.QLineEdit()
        self.seq_edit = QtWidgets.QLineEdit()
        self.shot_edit = QtWidgets.QLineEdit()
        for label, widget in (
            ("Episode No:", self.episode_edit),
            ("Seq No:", self.seq_edit),
            ("Shot No:", self.shot_edit),
        ):
            row1.addWidget(QtWidgets.QLabel(label))
            row1.addWidget(widget)
        root.addLayout(row1)

        row2 = QtWidgets.QHBoxLayout()
        row2.addWidget(QtWidgets.QLabel("Publish Type :"))
        self.publish_type_combo = QtWidgets.QComboBox()
        self.publish_type_combo.addItems(["07_layout", "08_animation"])
        row2.addWidget(self.publish_type_combo)

        self.cache_checkbox = QtWidgets.QCheckBox("Cache")
        row2.addWidget(self.cache_checkbox)

        row2.addWidget(QtWidgets.QLabel("Owner :"))
        self.owner_edit = QtWidgets.QLineEdit(_current_owner())
        self.owner_edit.setReadOnly(True)
        self.owner_edit.setEnabled(False)
        row2.addWidget(self.owner_edit)
        root.addLayout(row2)

        self.check_list = QtWidgets.QListWidget()
        self.check_list.setItemDelegate(_StatusDotDelegate(self.check_list))
        root.addWidget(self.check_list, stretch=1)

        row3 = QtWidgets.QHBoxLayout()
        self.sanity_button = QtWidgets.QPushButton("Sanity Check")
        self.publish_button = QtWidgets.QPushButton("Publish")
        self.publish_button.setEnabled(False)
        row3.addWidget(self.sanity_button)
        row3.addStretch(1)
        row3.addWidget(self.publish_button)
        root.addLayout(row3)

    def _connect_signals(self):
        self.publish_type_combo.currentTextChanged.connect(self._on_publish_type_changed)
        self.sanity_button.clicked.connect(self._run_sanity_checks)
        self.publish_button.clicked.connect(self._do_publish)

    # ------------------------------------------------------------------
    def _on_publish_type_changed(self, publish_type):
        """Repopulate the check list for the newly-selected publish type,
        all dots reset to pending -- switching type invalidates any prior
        run, since it's a different check set."""
        self.check_list.clear()
        self._sanity_results = []
        self.publish_button.setEnabled(False)
        for cls in get_check_classes(publish_type, dcc="maya"):
            item = QtWidgets.QListWidgetItem(cls.name)
            item.setData(QtCore.Qt.UserRole, CheckStatus.PENDING)
            item.setToolTip(cls.description)
            self.check_list.addItem(item)

    def _run_sanity_checks(self):
        publish_type = self.publish_type_combo.currentText()
        self.sanity_button.setEnabled(False)
        self.publish_button.setEnabled(False)
        try:
            def _progress(name, result):
                matches = self.check_list.findItems(name, QtCore.Qt.MatchExactly)
                if not matches:
                    return
                matches[0].setData(QtCore.Qt.UserRole, result.status)
                matches[0].setToolTip(result.message)
                self.check_list.viewport().update()
                QtWidgets.QApplication.processEvents()

            self._sanity_results = run_sanity_checks(publish_type, dcc="maya", progress_cb=_progress)
        finally:
            self.sanity_button.setEnabled(True)

        ok = all_checks_passed_or_warned(self._sanity_results)
        self.publish_button.setEnabled(ok)
        if not ok:
            failed = [chk.name for chk, res in self._sanity_results if res.status == CheckStatus.FAILED]
            QtWidgets.QMessageBox.warning(
                self,
                "Sanity Check Failed",
                "The following checks failed:\n\n" + "\n".join(failed),
            )

    def _do_publish(self):
        episode_no = self.episode_edit.text().strip()
        seq_no = self.seq_edit.text().strip()
        shot_no = self.shot_edit.text().strip()
        if not (episode_no and seq_no and shot_no):
            QtWidgets.QMessageBox.warning(
                self, "Missing Info", "Episode No, Seq No and Shot No are all required."
            )
            return
        if not self._sanity_results:
            QtWidgets.QMessageBox.warning(self, "Run Sanity Check First", "Run Sanity Check before publishing.")
            return

        self.publish_button.setEnabled(False)
        self.publish_button.setText("Publishing…")
        QtWidgets.QApplication.processEvents()
        try:
            result = publish_shot(
                episode_no=episode_no,
                seq_no=seq_no,
                shot_no=shot_no,
                publish_type=self.publish_type_combo.currentText(),
                cache=self.cache_checkbox.isChecked(),
                sanity_results=self._sanity_results,
                dcc="maya",
            )
        except Exception as exc:
            QtWidgets.QMessageBox.critical(self, "Publish Failed", str(exc))
            return
        finally:
            self.publish_button.setText("Publish")

        version_label = result.get("version", {}).get("versionNumber", "")
        QtWidgets.QMessageBox.information(
            self,
            "Published",
            f"Published {episode_no}/{seq_no}/{shot_no} as {version_label}.",
        )
        self.close()


def show():
    """Show the Shot Publish window, reusing/replacing an existing instance
    if the artist already has it open (avoids stacking duplicate windows
    every time this is re-launched from the shelf)."""
    app = QtWidgets.QApplication.instance()
    if app is None:
        raise RuntimeError("show() must be called from inside Maya.")

    for widget in app.allWidgets():
        if widget.objectName() == ShotPublishWindow.OBJECT_NAME:
            widget.close()
            widget.deleteLater()

    window = ShotPublishWindow()
    window.show()
    return window
