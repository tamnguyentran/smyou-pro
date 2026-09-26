"""identity_auth: employees, employee_roles, auth_sessions (M1-01a)

Revision ID: 20260926_0551
Revises: 20260925_0000
Create Date: 2026-09-26 05:51:29.491452+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '20260926_0551'
down_revision: str | None = '20260925_0000'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Case-insensitive unique email (DOMAIN_MODEL §1). Kept on downgrade: other objects may use it.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table('employees',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('full_name', sa.String(length=120), nullable=False),
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('department', sa.String(length=20), nullable=False),
    sa.Column('title', sa.String(length=80), nullable=True),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('must_change_password', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('failed_login_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('password_changed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("department IN ('MANAGEMENT', 'SALES', 'TECHNICAL')", name=op.f('ck_employees_department')),
    sa.CheckConstraint("phone ~ '^0[0-9]{9}$'", name=op.f('ck_employees_phone')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_employees')),
    sa.UniqueConstraint('code', name=op.f('uq_employees_code')),
    sa.UniqueConstraint('email', name=op.f('uq_employees_email'))
    )
    op.create_table('auth_sessions',
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('family_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('replaced_by_id', sa.Uuid(), nullable=True),
    sa.Column('user_agent', sa.String(length=200), nullable=True),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], name=op.f('fk_auth_sessions_employee_id_employees'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['replaced_by_id'], ['auth_sessions.id'], name=op.f('fk_auth_sessions_replaced_by_id_auth_sessions')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_auth_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_auth_sessions_token_hash'))
    )
    op.create_index(op.f('ix_auth_sessions_employee_id'), 'auth_sessions', ['employee_id'], unique=False)
    op.create_index(op.f('ix_auth_sessions_family_id'), 'auth_sessions', ['family_id'], unique=False)
    op.create_index(op.f('ix_auth_sessions_replaced_by_id'), 'auth_sessions', ['replaced_by_id'], unique=False)
    op.create_table('employee_roles',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.CheckConstraint("role IN ('MANAGER', 'SALE', 'TECH_LEAD', 'TECHNICIAN')", name=op.f('ck_employee_roles_role')),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], name=op.f('fk_employee_roles_employee_id_employees'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('employee_id', 'role', name=op.f('pk_employee_roles'))
    )


def downgrade() -> None:
    op.drop_table('employee_roles')
    op.drop_index(op.f('ix_auth_sessions_replaced_by_id'), table_name='auth_sessions')
    op.drop_index(op.f('ix_auth_sessions_family_id'), table_name='auth_sessions')
    op.drop_index(op.f('ix_auth_sessions_employee_id'), table_name='auth_sessions')
    op.drop_table('auth_sessions')
    op.drop_table('employees')
