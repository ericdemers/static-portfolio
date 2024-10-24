# Sketcher<sup><span style="color:rgb(190,190,190); font-weight:normal; font-size:0.7em">BSpline</span></sup> - User Interface Specification

## Introduction

### Purpose

The purpose of this document is to provide an accurate specification of Sketcher<sup><span style="color:rgb(190,190,190); font-weight:normal; font-size:0.7em">BSpline</span></sup> application user inteface. This specification defines the observable external behavior of the program.

### Overview

The Sketcher<sup><span style="color:rgb(190,190,190); font-weight:normal; font-size:0.7em">BSpline</span></sup> application allows you to draw and modify curves. The interface appears minimalist at first glance. Available on the web, you can interact with the app with a mouse, a stylus or touchscreen.

### Basic goals

The application aims not only to be easy to use but alsoe to be as transparent as possible in terms of its mathematical models. A primary goal is to show the elegance of b-spline theory.

### Projects

You can edit a curve while controlling the geometric properties of that curve. You can also manipulate several selected curves at once using general transformations of the plane. The combination of these two types of deformations, local and global, in a fluid manner, constitutes the main asset of the software.

Geometric properties include symmetries, continuity and basic geometric contraints including the number of inflections and curvature extrema.

## Presentation of the mathematical core

The mathematical core of the application rests on the shoulders of giants. Let us think for example of Felix Klein (1849-1925), Sophius Lie (1842-1899) and Jean Gaston Darboux (1842-1917) for the groups of transformations of the plane or Sergei Bernstein (1880-1968) for the Bernstein polynomials and Isaac Jacob Schoenberg (1903-1990) for the splines. These fundamental works are at the origin of the rich current literature from which we draw.

The “b-spline-algorithms” package that we plan to publish on npm aims for the analytical processing of b-splines. A trust region interior point optimizer and a library to assist optimization problem formulation are also key ingredients.

### Interaction with geometric elements

When opening the application, a white canvas is displayed. The options are then very limited. A minimalist icon provides access to the application's main menu. The toolbar contains a single pencil.

Without pressing any icon, it is then possible to draw a freehand curve. Pressing the pencil icon brings up the freehand curve, straight lines, circular arc and spiral options.

Clicking on the canvas without moving deselects the drawing icon. No toolbar icon is then selected.

When no design tool is selected, it is possible to select curves. Clicking on a curve allows you to move it. The control polygon is displayed when the curve is released. After selecting a curve the "B" icon for basis function, appear on the right menu.

When the "B" icon is selected then the basis functions editing window is displayed. A zoom-scrolling button allows you to enlarge and thus better see a particular section of the basis functions in its parametric domain. Touching and moving the basis functions display area allows you to move the function horizontally. The position of the knots is displayed on a bar below. It is possible to move them. Selecting a knot or touching the parametric line first displays a position on the parametric line as well as on the curve. It then becomes possible to insert a knot at this position or to delete a selected knot. The multiplicity of knots is shown using multiple vertical lines under the basis functions.

When one or more curve are drawn on the canvas, the selection rectangle icon become visible on the top creation toolbar. Once selected, it becomes possible to select multiple curves by drawing a rectangle. Every curve that has a control point inside the light gray rectangle is selected. After the first selection, a shift button appear on the top toolbar. Pressing the shift button allows you to select add or remove curve from the selection. The selection is shown with a blue box that surround all curves control points. It is possible to translate or scale the selected curves. More options can also appear on the right menu to apply group transformations compatible with the selected curves.

Anytime a curve is selected, a trash can icon and a copy icon are displayed on the top menu.

When a curve is selected, the set of currently applied constraints is displayed graphically directly on the curve and the set of possible constraints to add are shown on the right menu. To add one you just press the icon. To delete a constraint, you select it and press the trash can icon.

To rotate a symmetry axis, for example, you select a curve and apply a plan transformation to the curve.

### Editing goals

To obtain finer control over your curve you will eventually need to insert knots and thus increase the number of control points which allow you to define the shape of your curve. You then have in your hands a curve that becomes more malleable.

Controlling the number of points of curvature extrema allows you to obtain increasingly malleable curves by inserting knots which can then be modified without introducing unwanted oscillations. You will be able to explore, for example, spirals and oval shapes in their greatest generality.

### Structural analysis

The application can be in different states. The main states are: Freehand drawing of a curve, drawing of a straight line, drawing of a circular arc, drawing of a spiral, single selection and multiple selection of curves.

In addition to these main states, the main current actions are : no action in progress, drawing of a curve, moving the selected curves, moving a control point.

Sketch elements are stored in a list with a unique identification number. The sketch elements are the different types of b-spline curves and the different types of geometric constraints that can be applied to these b-spline curves.

Each curve contains the list of constraints that apply to itself. If a curve is deleted all constraints in the list are also deleted.

A constraint can be shared between different curves. Then the constraints must also be deleted for the other curve with the exception of symmetry constraints.

## Menus

### Application menus

## Toolbars

### Standard toolbar

### Circle and Conic

The arc icon on the top creation toolbar allows you to draw either an arc or a complete circle. When the two endpoints are close enough, the circle close itself and moving further the cursor moves the newly created circle.

Once created, the arc or the full circle can be modified using the 3 control points.

A conic is obtained by switching from complex to rational b-spline. The conic can be manipulated with the second degree Bézier curve control polygon.

The option to close or to open the circle or the conic is shown on the right toolbar.

### Toolbar for a B-spline curve

For any b-spline, it is possible to close the curve by bringing the ends together. Then nodes are added in order to superpose $d$ nodes where $d$ is the degree of the curve. Multiple nodes must be removed at the junction to increase continuity if necessary.

It is possible to cut a curve by inserting enough knots and then choosing the scissor which is added to the menu. It is also possible to slide enough knots together to cut a curve. If the result is two curve than you must confirm the seperation by clicking the scissor or just by deselecting the curve.

The icon for the control over the curvature extrema is an ellipse with 4 dots at its curvature extrema. An icon with a dot on the inflection of a cubic also allows you to activate control over the inflections.

When two extremum points of curvature come into contact, a red X is added to the superposition. Pressing the icon allows you to delete the curvature extremum point which is in fact already absent but which can reappear at any time since the constraint still allows it.

## Type of b-spline curves

The different type of b-spline curves are non rational, rational and complex. Each of these has a pythagorean hodograph subset.

To change the type of a given curve, the options are line segment with two control points at the ends, an added slider for rational curves, an added control point for complex curves and an added arrow for Pythagorean hodograph curves. The current selection is displayed on the right menu when a single curve is selected. Selecting the icon displays the other options. For Pythagorean hodograph curves there is an icon on the right toolbar to change the direction of the arrow.

## Curvature extrema and inflections

## Miscelleneous interface elements

### Specification selection

## Glossary of terms

## Special considerations

## Undo Redo and the history of curve modifications

The history of curve changes is saved in a list that contains lists of curves at different steps, so it's just a list of lists of curves.

The symmetries are also saved in a list that contains lists of curve generators. The generator use group element to produce curves or section of curves.

A group transformation applied to a given curve implies also a transformation to the associated curves. The relation must be compatible with that transformation so that the same transformation is applied to every member of the equivalence class.

A generated curve is highlighted when selected and the original curve control polygon is shown.

For non-abelian transformations, it is possible to do pre and post composition. For example, rotation and translation. After selecting the whole group, post composition is applied. After selecting an element of the group, pre composition is applied. How to obtain a transformation of a subset of curves? The option to modify only selected curves is then displayed in the toolbar. Selecting this option allows you to transform only the selected curves.

## Shapes to draw easily

Straight horizontal and vertical lines, circles, conics, egg shapes, ovals with 4 extremums of curvature and 2 symmetry axis, rectangles with rounded corners, rectangles with aesthetic corners, equilateral and isosceles triangles, airplane wing profiles, heart shapes.
