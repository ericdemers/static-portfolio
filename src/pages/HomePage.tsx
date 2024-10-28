import { Icon } from "@iconify/react/dist/iconify.js"
import { Link } from "react-router-dom"

/**
 * HomePage component
 *
 * This component renders the main landing page for the application.
 * It displays the company logo and navigation links.
 */
function HomePage() {
  return (
    <div className="bg-gradient-to-br from-steelblue-900 to-steelblue-200 min-h-screen">
      <div className="h-screen flex flex-col gap-10 items-center justify-center">
        {/* Logo */}
        <LogoSection />

        {/* Navigation Links */}
        <NavigationLinks />
      </div>
    </div>
  )
}

/**
 * LogoSection component
 *
 * Renders the animated logo for Numeric Elements.
 */
function LogoSection() {
  return (
    <div className="animate-pulse-logo">
      <div className="transform-gpu font-thin text-transparent text-5xl md:text-7xl bg-clip-text bg-logo-gradient drop-shadow-[1px_1px_1px_rgba(150,150,150,0.8)] tracking-widest">
        Numeric Elements
      </div>
    </div>
  )
}

/**
 * NavigationLinks component
 *
 * Renders the navigation links for Sketcher, Source, and Community.
 */
function NavigationLinks() {
  return (
    <div className="text-white text-2xl md:text-3xl font-thin text-opacity-50 hover:text-opacity-50 tracking-widest">
      <ul className="flex flex-row gap-16">
        <SketcherLink />
        <SourceLink />
        <CommunityLink />
      </ul>
    </div>
  )
}

/**
 * SketcherLink component
 *
 * Renders the link to the Sketcher page.
 */
function SketcherLink() {
  return (
    <li className="animate-fade-in-up-2 hover:text-neutral-300">
      <Link to="/sketcher">Sketcher &nbsp; &nbsp;</Link>
      <div className="relative text-sm md:text-lg top-[-75%] left-[71%] opacity-50 font-light">
        BSpline
      </div>
    </li>
  )
}

/**
 * SourceLink component
 *
 * Renders the link to the GitHub source repository.
 */
function SourceLink() {
  return (
    <li className="animate-fade-in-up-3 hover:text-neutral-300">
      <a href="https://github.com/numericelements" className="relative">
        Source
      </a>
      <div className="relative top-[-75%] left-[88%]">
        <Icon
          icon="carbon:logo-github"
          className="opacity-50 size-5 md:size-6"
        />
      </div>
    </li>
  )
}

/**
 * CommunityLink component
 *
 * Renders the link to the Discord community.
 */
function CommunityLink() {
  return (
    <li className="animate-fade-in-up-4 hover:text-neutral-300">
      <a href="https://discord.gg/7hMWSvFzrB">Community</a>
      <div className="relative top-[-72%] left-[95%]">
        <Icon
          icon="carbon:logo-discord"
          className="opacity-50 size-5 md:size-6"
        />
      </div>
    </li>
  )
}

export default HomePage
