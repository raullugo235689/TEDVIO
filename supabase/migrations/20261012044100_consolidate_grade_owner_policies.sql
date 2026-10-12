-- Equivalent teacher-only ownership with explicit parent/category matching.
-- Removes the permissive c.group_id=c.group_id condition. No academic data changes.
drop policy if exists v2_grade_categories_owner on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_insert on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_select on public.v2_grade_categories;
drop policy if exists v2_grade_categories_teacher_v2_update on public.v2_grade_categories;
create policy v2_grade_categories_owner on public.v2_grade_categories for all to authenticated
using(teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=v2_grade_categories.group_id and g.teacher_id=(select auth.uid())))
with check(teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=v2_grade_categories.group_id and g.teacher_id=(select auth.uid())));
drop policy if exists v2_grade_items_owner on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_insert on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_select on public.v2_grade_items;
drop policy if exists v2_grade_items_teacher_v2_update on public.v2_grade_items;
create policy v2_grade_items_owner on public.v2_grade_items for all to authenticated
using(teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=v2_grade_items.group_id and g.teacher_id=(select auth.uid())))
with check(teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=v2_grade_items.group_id and g.teacher_id=(select auth.uid()))
  and (category_id is null or exists(select 1 from public.v2_grade_categories c where c.id=v2_grade_items.category_id and c.group_id=v2_grade_items.group_id and c.teacher_id=(select auth.uid()))));
