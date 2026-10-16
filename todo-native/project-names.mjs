// A configured project name is user data, including the name "Geral".
export function projectNames(defaultProject) {
  const normalizeProjectName = name => name || defaultProject;
  const ensureDefaultProject = list => {
    const unique = [...new Set(list.map(normalizeProjectName).filter(Boolean))];
    return [defaultProject, ...unique.filter(name => name !== defaultProject)];
  };
  return { normalizeProjectName, ensureDefaultProject };
}
