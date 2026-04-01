project(cpp_sample_07_multistage_anpr)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 07_multistage_anpr.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
