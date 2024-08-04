export const viewportCoordsToSceneCoords = (
    { clientX, clientY }: { clientX: number; clientY: number },
    {
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
    }: {
      zoom: number
      offsetLeft: number
      offsetTop: number
      scrollX: number
      scrollY: number
    },
  ) => {
    const x = (clientX - offsetLeft) / zoom - scrollX;
    const y = (clientY - offsetTop) / zoom - scrollY;
  
    return { x, y }
  };
  
  export const sceneCoordsToViewportCoords = (
    { sceneX, sceneY }: { sceneX: number; sceneY: number },
    {
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
    }: {
      zoom: number
      offsetLeft: number
      offsetTop: number
      scrollX: number
      scrollY: number
    },
  ) => {
    const x = (sceneX + scrollX) * zoom + offsetLeft
    const y = (sceneY + scrollY) * zoom + offsetTop
    return { x, y }
  };