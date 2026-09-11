-- Issue #53 · Consolidate duplicated gradebook RLS policies after reviewing
-- the production workload and the isolated recovery schema.

-- The legacy `*_owner` ALL policies overlapped the operation-specific
-- policies. Because permissive policies are ORed, the overlap also allowed an
-- item to be moved to a category from another group through the weaker UPDATE
-- policy. Replace both policy families with one explicit policy per action.

drop policy if exists v2_grade_categories_owner on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_select on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_insert on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_update on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_delete on public.v2_grade_categories;

create policy v2_grade_categories_teacher_v2_select
on public.v2_grade_categories for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_categories.group_id
      and g.teacher_id = (select auth.uid())
  )
);

create policy v2_grade_categories_teacher_v2_insert
on public.v2_grade_categories for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_categories.group_id
      and g.teacher_id = (select auth.uid())
  )
);

create policy v2_grade_categories_teacher_v2_update
on public.v2_grade_categories for update to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_categories.group_id
      and g.teacher_id = (select auth.uid())
  )
)
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_categories.group_id
      and g.teacher_id = (select auth.uid())
  )
);

create policy v2_grade_categories_teacher_v2_delete
on public.v2_grade_categories for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_categories.group_id
      and g.teacher_id = (select auth.uid())
  )
);

drop policy if exists v2_grade_items_owner on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_select on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_insert on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_update on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_delete on public.v2_grade_items;

create policy v2_grade_items_teacher_v2_select
on public.v2_grade_items for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_items.group_id
      and g.teacher_id = (select auth.uid())
  )
);

create policy v2_grade_items_teacher_v2_insert
on public.v2_grade_items for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_items.group_id
      and g.teacher_id = (select auth.uid())
  )
  and (
    category_id is null
    or exists (
      select 1 from public.v2_grade_categories c
      where c.id = v2_grade_items.category_id
        and c.group_id = v2_grade_items.group_id
        and c.teacher_id = (select auth.uid())
    )
  )
);

create policy v2_grade_items_teacher_v2_update
on public.v2_grade_items for update to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_items.group_id
      and g.teacher_id = (select auth.uid())
  )
)
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_items.group_id
      and g.teacher_id = (select auth.uid())
  )
  and (
    category_id is null
    or exists (
      select 1 from public.v2_grade_categories c
      where c.id = v2_grade_items.category_id
        and c.group_id = v2_grade_items.group_id
        and c.teacher_id = (select auth.uid())
    )
  )
);

create policy v2_grade_items_teacher_v2_delete
on public.v2_grade_items for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id = v2_grade_items.group_id
      and g.teacher_id = (select auth.uid())
  )
);

-- No new index is added here. The unindexed foreign keys reported on
-- 2026-09-06 belong to legacy or empty alternate tables, while the active
-- v2_grade_* access paths already have covering indexes. Reassess after the
-- expanded pilot instead of adding speculative write overhead.
